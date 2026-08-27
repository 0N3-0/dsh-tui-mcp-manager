import { Service, type Context } from '@deepseek-ai/cordis'
import { settingsNamespace, type SettingsScope } from '@deepseek-ai/dsh-settings'
import { credentialRef } from '@deepseek-ai/dsh-credentials'
import { constants } from 'node:fs'
import { access, stat } from 'node:fs/promises'
import { delimiter, isAbsolute, join, resolve } from 'node:path'
import {
  McpManagerSettingsSchema,
  cloneServerRecord,
  normalizeSecretHeaderEntries,
  normalizeServerRecord,
  validateMcpManagerSettings,
} from './schema.js'
import { detectProfile, type ProfileIdentity } from './profile.js'
import { loaderRowId, ProfilePatchStore, toLoaderEntry, type PatchStoreSnapshot } from './patch-store.js'
import {
  applyActiveSetsToServers,
  normalizeSetRecord,
  ProfileSetStore,
  removeServerFromSets,
  type SetStoreSnapshot,
} from './set-store.js'
import {
  ManagerError,
  type CredentialStateView,
  type ManagedServerRecord,
  type ManagedSetRecord,
  type McpDoctorCheck,
  type McpDoctorReport,
  type McpManagerSnapshot,
  type McpServerView,
  type McpToolView,
  type ServerRuntimeState,
} from './types.js'

const LEGACY_SETTINGS_NAMESPACE = 'mcp-manager'
const RPC_CHANNEL = '/mcp-manager'
const DIRECT_PLUGIN = '@deepseek-ai/dsh-mcp-client'
const CREDENTIAL_PLUGIN = 'dsh-tui-mcp-manager/server'
const LEGACY_CREDENTIAL_PLUGIN = 'dsh-mcp-manager/server'

interface RuntimeRecord {
  id: string
  config: ManagedServerRecord
  fingerprint: string
  state: ServerRuntimeState
  error?: string
  tools: McpToolView[]
  updatedAt: number
}

interface LoaderEntryFace {
  options: {
    id: string
    name: string
    disabled?: boolean
    config?: unknown
  }
  fiber?: {
    uid: number | null
    /** Cordis FiberState: PENDING=0, LOADING=1, ACTIVE=2. */
    state: number
  }
  update(options: Record<string, unknown>, create?: boolean, force?: boolean): Promise<void>
}

const FIBER_STATE_ACTIVE = 2

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`
  if (value !== null && typeof value === 'object') {
    const record = value as Record<string, unknown>
    return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${stable(record[key])}`).join(',')}}`
  }
  return JSON.stringify(value)
}

/**
 * File-backed MCP manager.
 *
 * The active profile's `cordis.patch.yml` is the sole configuration source.
 * DSH's patch watcher and Cordis Loader own activation, HMR, disable and
 * disposal. This service edits only its marked block and projects runtime
 * state to the Web/TUI front doors.
 */
export class McpManagerService extends Service {
  static inject = ['tools', 'loader']

  private readonly profile: ProfileIdentity
  private readonly store?: ProfilePatchStore
  private readonly setStore?: ProfileSetStore
  private legacySettings?: SettingsScope<unknown>
  private readonly records = new Map<string, RuntimeRecord>()
  private readonly changeListeners = new Set<() => void>()
  private revision = 0
  private changeNotificationQueued = false
  private chain: Promise<void> = Promise.resolve()
  private lastStorage?: PatchStoreSnapshot

  constructor(ctx: Context) {
    super(ctx, 'mcpManager')
    this.profile = detectProfile(ctx)
    this.store = this.profile.patchPath === undefined ? undefined : new ProfilePatchStore(this.profile.patchPath)
    this.setStore = this.profile.dir === undefined ? undefined : new ProfileSetStore(join(this.profile.dir, 'mcp-manager.sets.yml'))
    this.installLegacySettingsMigration()
    this.installToolRegistryTracking()
    this.installPatchFailureTracking()
    this.installRpcChannel()
  }

  // ── wiring ────────────────────────────────────────────────────────────────

  /**
   * Subscribe to manager-owned state changes.
   *
   * Renderers still perform a low-frequency file refresh because profile files
   * may be edited outside this process. This feed covers mutations, Loader
   * projections, tool-registry changes, and reconnect transitions immediately.
   */
  subscribe(listener: () => void): () => void {
    this.changeListeners.add(listener)
    return () => this.changeListeners.delete(listener)
  }

  private bumpRevision(): void {
    this.revision += 1
    if (this.changeNotificationQueued) return
    this.changeNotificationQueued = true
    queueMicrotask(() => {
      this.changeNotificationQueued = false
      for (const listener of this.changeListeners) {
        try {
          listener()
        } catch (error) {
          this.ctx.logger?.warn?.('mcp-manager change listener failed: %s', errorText(error))
        }
      }
    })
  }

  /** Register the old section read-only so an existing install can migrate once. */
  private installLegacySettingsMigration(): void {
    this.ctx.inject(['settings'], (settingsCtx) => {
      const scope = settingsCtx.settings.register(settingsNamespace(LEGACY_SETTINGS_NAMESPACE), McpManagerSettingsSchema, {
        applies: 'restart',
        validate: validateMcpManagerSettings,
      })
      this.legacySettings = scope
      settingsCtx.effect(() => () => {
        this.legacySettings = undefined
      }, 'mcp-manager.legacy-settings')
      void this.enqueue(() => this.syncFromFile())
    })
  }

  private installToolRegistryTracking(): void {
    this.ctx.on('tools/change', () => {
      for (const record of this.records.values()) {
        this.refreshTools(record)
      }
    })
  }

  private installPatchFailureTracking(): void {
    ;(this.ctx as any).on('hmr/config-update-failed', (filename: string, error: Error) => {
      if (this.store === undefined || resolve(filename) !== resolve(this.store.path)) return
      for (const record of this.records.values()) {
        if (this.entryMatches(record.config, this.loaderEntry(record.id))) continue
        record.state = 'failed'
        record.error = `DSH could not apply cordis.patch.yml: ${errorText(error)}`
        this.touch(record)
      }
    })
  }

  private installRpcChannel(): void {
    this.ctx.inject(['connection'], (connCtx) => {
      const connection = (connCtx as any).connection
      connection.rpc.handle(
        RPC_CHANNEL,
        async (endpoint: string, payload: unknown) => {
          try {
            return { ok: true as const, value: await this.dispatchRpc(endpoint, payload) }
          } catch (error) {
            const managerError = error instanceof ManagerError ? error : new ManagerError(errorText(error), { cause: error })
            return {
              ok: false as const,
              error: {
                code: 'internal',
                message: managerError.message,
                details: { kind: managerError.code },
              },
            }
          }
        },
        { authority: 'loopback' },
      )
    })
  }

  // ── file source and migration ─────────────────────────────────────────────

  private enqueue<T>(task: () => Promise<T>): Promise<T> {
    const run = this.chain.then(task, task)
    this.chain = run.then(() => undefined, () => undefined)
    return run
  }

  private requireStore(): ProfilePatchStore {
    if (this.store === undefined) {
      throw new ManagerError(
        'The active DSH profile could not be resolved from ctx.baseUrl; cordis.patch.yml editing is unavailable.',
        { code: 'profile-unavailable' },
      )
    }
    return this.store
  }

  private legacyServers(): ManagedServerRecord[] {
    if (this.legacySettings === undefined) return []
    const value = this.legacySettings.get() as { profiles?: Record<string, { servers?: ManagedServerRecord[] }> }
    return (value.profiles?.[this.profile.key]?.servers ?? []).map((server) => normalizeServerRecord(cloneServerRecord(server)))
  }

  private async readStorage(): Promise<PatchStoreSnapshot> {
    const store = this.requireStore()
    let snapshot = await store.read()
    if (!snapshot.hasManagedBlock) {
      const legacy = this.legacyServers()
      if (legacy.length > 0) {
        this.assertNoExternalNamespaceConflict(legacy)
        snapshot = await store.write(legacy)
        this.ctx.logger.info(
          'mcp-manager: imported %d legacy settings server(s) into %s; the legacy settings section is retained as a backup',
          legacy.length,
          store.path,
        )
      }
    } else if (snapshot.needsAdapterMigration) {
      snapshot = await store.write(snapshot.servers)
      this.ctx.logger.info(
        'dsh-tui-mcp-manager: migrated credential adapter rows from %s to %s in %s',
        LEGACY_CREDENTIAL_PLUGIN,
        CREDENTIAL_PLUGIN,
        store.path,
      )
    }
    this.lastStorage = snapshot
    return snapshot
  }

  private async writeServers(servers: ManagedServerRecord[]): Promise<PatchStoreSnapshot> {
    this.assertNoExternalNamespaceConflict(servers)
    const snapshot = await this.requireStore().write(servers)
    this.lastStorage = snapshot
    return snapshot
  }

  private async readSets(serverIds?: Set<string>, activateInitialDefault = false): Promise<SetStoreSnapshot> {
    if (this.setStore === undefined) return { sets: [], activeSetIds: [], initialized: true, writable: false, path: '' }
    let snapshot = await this.setStore.read()
    if (!snapshot.initialized && serverIds !== undefined) {
      const sets = [...snapshot.sets]
      let defaultId = 'default'
      for (let index = 1; sets.some((set) => set.id === defaultId); index += 1) defaultId = `default-${index}`
      sets.push({ id: defaultId, name: 'Default', serverIds: [...serverIds] })
      const activeSetIds = activateInitialDefault ? [...snapshot.activeSetIds, defaultId] : snapshot.activeSetIds
      snapshot = await this.setStore.write(sets, activeSetIds)
    }
    if (serverIds !== undefined) {
      snapshot.sets = snapshot.sets.map((set) => ({
        ...set,
        serverIds: set.serverIds.filter((id) => serverIds.has(id)),
      }))
    }
    return snapshot
  }

  private async writeSets(
    sets: ManagedSetRecord[],
    activeSetIds: string[] = [],
  ): Promise<SetStoreSnapshot> {
    if (this.setStore === undefined) throw new ManagerError('active profile path is unavailable', { code: 'profile-unavailable' })
    const snapshot = await this.setStore.write(sets, activeSetIds)
    this.bumpRevision()
    return snapshot
  }

  private loaderEntries(): LoaderEntryFace[] {
    return [...((this.ctx as any).loader as { entries(): Iterable<LoaderEntryFace> }).entries()]
  }

  private loaderEntry(id: string): LoaderEntryFace | undefined {
    const rowId = loaderRowId(id)
    return this.loaderEntries().find((entry) => entry.options.id === rowId)
  }

  private assertNoExternalNamespaceConflict(servers: ManagedServerRecord[]): void {
    const ownedRows = new Set(servers.map((server) => loaderRowId(server.id)))
    const external = this.loaderEntries().filter((entry) =>
      !ownedRows.has(entry.options.id)
      && (
        entry.options.name === DIRECT_PLUGIN
        || entry.options.name === CREDENTIAL_PLUGIN
        || entry.options.name === LEGACY_CREDENTIAL_PLUGIN
      ),
    )
    for (const server of servers) {
      const conflict = external.find((entry) => {
        const config = entry.options.config
        return typeof config === 'object' && config !== null && (config as { serverName?: unknown }).serverName === server.serverName
      })
      if (conflict !== undefined) {
        throw new ManagerError(
          `serverName ${JSON.stringify(server.serverName)} is already used by external Loader row ${JSON.stringify(conflict.options.id)}; import or rename that row first.`,
          { code: 'duplicate-server-name' },
        )
      }
    }
  }

  private entryMatches(record: ManagedServerRecord, entry: LoaderEntryFace | undefined): boolean {
    if (entry === undefined) return false
    const expected = toLoaderEntry(record)
    return entry.options.name === expected.name
      && Boolean(entry.options.disabled) === Boolean(expected.disabled)
      && stable(entry.options.config) === stable(expected.config)
  }

  private async syncFromFile(snapshot?: PatchStoreSnapshot): Promise<void> {
    if (this.store === undefined) return
    snapshot ??= await this.readStorage()
    const ids = new Set(snapshot.servers.map((server) => server.id))
    for (const id of [...this.records.keys()]) {
      if (!ids.has(id)) {
        this.records.delete(id)
        this.bumpRevision()
      }
    }

    for (const config of snapshot.servers) {
      const fingerprint = stable(config)
      let record = this.records.get(config.id)
      if (record === undefined) {
        record = {
          id: config.id,
          config,
          fingerprint,
          state: config.enabled ? 'starting' : 'disabled',
          tools: [],
          updatedAt: Date.now(),
        }
        this.records.set(config.id, record)
        this.bumpRevision()
      } else if (record.fingerprint !== fingerprint) {
        record.config = config
        record.fingerprint = fingerprint
        record.state = config.enabled ? 'starting' : 'disabled'
        record.error = undefined
        this.touch(record)
      } else {
        record.config = config
      }

      const stateBeforeProjection = record.state
      const errorBeforeProjection = record.error
      this.refreshTools(record)
      if (!config.enabled) {
        record.state = 'disabled'
        record.error = undefined
        if (record.state !== stateBeforeProjection || record.error !== errorBeforeProjection) this.touch(record)
        continue
      }
      const entry = this.loaderEntry(config.id)
      // A Fiber receives its uid before an async plugin finishes loading.
      // dsh-mcp-client registers the initial tool generation during that
      // LOADING phase, so uid presence alone can briefly project READY / 0.
      const active = entry?.fiber?.state === FIBER_STATE_ACTIVE
      if (this.entryMatches(config, entry) && active && record.state !== 'failed' && record.state !== 'reconnecting') {
        record.state = 'connected'
        record.error = undefined
      } else if (!active && record.state !== 'failed' && record.state !== 'reconnecting') {
        record.state = 'starting'
      }
      if (record.state !== stateBeforeProjection || record.error !== errorBeforeProjection) this.touch(record)
    }
  }

  // ── runtime projection ────────────────────────────────────────────────────

  private touch(record: RuntimeRecord): void {
    record.updatedAt = Date.now()
    this.bumpRevision()
  }

  private toolsFor(serverName: string): McpToolView[] {
    const prefix = `mcp__${serverName}__`
    return this.ctx.tools.schemas()
      .filter((schema) => schema.name.startsWith(prefix))
      .map((schema) => ({
        name: schema.name,
        description: schema.description,
        parameters: (schema.parameters ?? {}) as Record<string, unknown>,
      }))
  }

  /** Reconcile the cached view with the native registry without inventing a state transition. */
  private refreshTools(record: RuntimeRecord): void {
    const tools = this.toolsFor(record.config.serverName)
    if (stable(record.tools) === stable(tools)) return
    record.tools = tools
    this.touch(record)
  }

  // ── RPC dispatch ──────────────────────────────────────────────────────────

  async invoke(endpoint: string, payload: unknown): Promise<McpManagerSnapshot> {
    return this.dispatchRpc(endpoint, payload)
  }

  /**
   * Diagnose one server without opening another MCP transport. Runtime checks
   * are projections of the Loader-owned client already running in this host.
   */
  async doctor(id: string): Promise<McpDoctorReport> {
    await this.enqueue(() => this.syncFromFile())
    const record = this.records.get(id)
    if (record === undefined) throw new ManagerError(`server ${JSON.stringify(id)} does not exist`, { code: 'not-found' })
    const view = await this.viewFor(record)
    const checks: McpDoctorCheck[] = []

    if (!this.lastStorage?.writable) {
      checks.push({
        id: 'storage',
        state: 'fail',
        detail: this.store === undefined ? 'active profile path is unavailable' : `not writable: ${this.store.path}`,
        suggestion: 'fix-permissions',
      })
    }

    const entry = this.loaderEntry(id)
    const loaderApplied = this.entryMatches(record.config, entry)
    checks.push({
      id: 'loader',
      state: loaderApplied ? 'pass' : 'fail',
      detail: loaderApplied
        ? `applied${entry?.fiber?.state === FIBER_STATE_ACTIVE ? ', Fiber active' : ', Fiber is not active yet'}`
        : 'managed row has not been applied by the Loader',
      ...(loaderApplied ? {} : { suggestion: 'reload-profile' as const }),
    })

    if (view.transport === 'stdio') {
      const executable = await resolveExecutable(view.command ?? '', view.cwd, view.env?.PATH)
      checks.push({
        id: 'target',
        state: executable ? 'pass' : 'fail',
        detail: executable ? executable : `not found or not executable: ${view.command ?? ''}`,
        ...(executable ? {} : { suggestion: 'edit-command' as const }),
      })
      if (view.cwd) {
        let cwdState: McpDoctorCheck['state'] = 'pass'
        let detail = `directory exists: ${view.cwd}`
        try {
          if (!(await stat(view.cwd)).isDirectory()) throw new Error('not a directory')
        } catch (error) {
          cwdState = 'fail'
          detail = `invalid working directory: ${view.cwd} (${errorText(error)})`
        }
        checks.push({ id: 'cwd', state: cwdState, detail, ...(cwdState === 'fail' ? { suggestion: 'edit-cwd' as const } : {}) })
      }
    } else {
      let state: McpDoctorCheck['state'] = 'pass'
      let detail = view.url ?? ''
      try {
        const url = new URL(view.url ?? '')
        if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new Error('protocol must be http or https')
      } catch (error) {
        state = 'fail'
        detail = `invalid MCP URL: ${errorText(error)}`
      }
      checks.push({ id: 'target', state, detail, ...(state === 'fail' ? { suggestion: 'edit-url' as const } : {}) })
    }

    const credentialEntries = [
      ...Object.entries(view.secretEnv ?? {}).map(([name, item]) => [name, item.credential] as const),
      ...Object.entries(view.secretHeaders ?? {}).map(([name, item]) => [name, item.credential] as const),
    ]
    const missingCredentials = credentialEntries.filter(([, item]) => !item.configured).map(([name]) => name)
    if (credentialEntries.length > 0) {
      checks.push({
        id: 'credentials',
        state: missingCredentials.length === 0 ? 'pass' : 'fail',
        detail: missingCredentials.length === 0
          ? credentialEntries.map(([name]) => name).join(', ')
          : `missing: ${missingCredentials.join(', ')}`,
        ...(missingCredentials.length > 0 ? { suggestion: 'set-credentials' as const } : {}),
      })
    }

    const runtimeState: McpDoctorCheck['state'] = view.state === 'connected'
      ? 'pass'
      : view.state === 'failed' || view.state === 'stopped'
        ? 'fail'
        : 'warn'
    checks.push({
      id: 'runtime',
      state: runtimeState,
      detail: view.error ? `${view.state}: ${view.error}` : view.state,
      ...(runtimeState === 'pass' ? {} : { suggestion: runtimeSuggestion(view) }),
    })
    checks.push({
      id: 'tools',
      state: view.tools.length > 0 ? 'pass' : 'warn',
      detail: `${view.tools.length} registered tool(s)`,
      ...(view.tools.length > 0 ? {} : { suggestion: view.state === 'connected' ? 'reconnect-runtime' as const : 'wait-runtime' as const }),
    })

    return {
      serverId: id,
      state: checks.some((check) => check.state === 'fail')
        ? 'fail'
        : checks.some((check) => check.state === 'warn') ? 'warn' : 'pass',
      checkedAt: Date.now(),
      checks,
    }
  }

  private async dispatchRpc(endpoint: string, payload: unknown): Promise<McpManagerSnapshot> {
    switch (endpoint) {
      case 'list':
        await this.enqueue(() => this.syncFromFile())
        return this.snapshot()
      case 'upsertSet': {
        const set = normalizeSetRecord(asPayload(payload).set)
        await this.enqueue(async () => {
          const storage = await this.readStorage()
          const known = new Set(storage.servers.map((server) => server.id))
          const unknown = set.serverIds.filter((id) => !known.has(id))
          if (unknown.length > 0) throw new ManagerError(`set references unknown server(s): ${unknown.join(', ')}`, { code: 'not-found' })
          const sets = await this.readSets(known)
          const duplicateName = sets.sets.find((candidate) =>
            candidate.id !== set.id && candidate.name.toLocaleLowerCase() === set.name.toLocaleLowerCase(),
          )
          if (duplicateName !== undefined) {
            throw new ManagerError(`set name ${JSON.stringify(set.name)} is already used by ${JSON.stringify(duplicateName.id)}`, { code: 'duplicate-set-name' })
          }
          const index = sets.sets.findIndex((candidate) => candidate.id === set.id)
          if (index === -1) sets.sets.push(set)
          else sets.sets[index] = set
          const servers = applyActiveSetsToServers(storage.servers, sets.sets, sets.activeSetIds)
          const written = await this.writeServers(servers)
          await this.writeSets(sets.sets, sets.activeSetIds)
          await this.syncFromFile(written)
        })
        return this.snapshot()
      }
      case 'removeSet': {
        const id = stringField(payload, 'id')
        await this.enqueue(async () => {
          const storage = await this.readStorage()
          const sets = await this.readSets()
          if (!sets.sets.some((set) => set.id === id)) throw new ManagerError(`set ${JSON.stringify(id)} does not exist`, { code: 'not-found' })
          const remainingSets = sets.sets.filter((set) => set.id !== id)
          const activeSetIds = sets.activeSetIds.filter((candidate) => candidate !== id)
          const servers = applyActiveSetsToServers(storage.servers, remainingSets, activeSetIds)
          const written = await this.writeServers(servers)
          await this.writeSets(remainingSets, activeSetIds)
          await this.syncFromFile(written)
        })
        return this.snapshot()
      }
      case 'toggleSet': {
        const id = stringField(payload, 'id')
        await this.enqueue(async () => {
          const storage = await this.readStorage()
          const known = new Set(storage.servers.map((server) => server.id))
          const sets = await this.readSets(known)
          const set = sets.sets.find((candidate) => candidate.id === id)
          if (set === undefined) throw new ManagerError(`set ${JSON.stringify(id)} does not exist`, { code: 'not-found' })
          const requested = asPayload(payload).enabled
          if (requested !== undefined && typeof requested !== 'boolean') {
            throw new ManagerError('enabled must be a boolean', { code: 'invalid-payload' })
          }
          const active = new Set(sets.activeSetIds)
          const enabled = typeof requested === 'boolean' ? requested : !active.has(id)
          if (enabled) active.add(id)
          else active.delete(id)
          const servers = applyActiveSetsToServers(storage.servers, sets.sets, [...active])
          const written = await this.writeServers(servers)
          await this.writeSets(sets.sets, [...active])
          await this.syncFromFile(written)
        })
        return this.snapshot()
      }
      case 'upsert': {
        const record = normalizeServerRecord(asRecord(payload, 'server'))
        await this.enqueue(async () => {
          const storage = await this.readStorage()
          const servers = storage.servers
          const duplicate = servers.find((candidate) => candidate.id !== record.id && candidate.serverName === record.serverName)
          if (duplicate !== undefined) {
            throw new ManagerError(
              `serverName ${JSON.stringify(record.serverName)} is already used by server ${JSON.stringify(duplicate.id)}.`,
              { code: 'duplicate-server-name' },
            )
          }
          const index = servers.findIndex((candidate) => candidate.id === record.id)
          if (index === -1) servers.push(record)
          else servers[index] = record
          const sets = await this.readSets(new Set(servers.map((server) => server.id)))
          const normalizedServers = applyActiveSetsToServers(servers, sets.sets, sets.activeSetIds)
          const written = await this.writeServers(normalizedServers)
          await this.syncFromFile(written)
        })
        return this.snapshot()
      }
      case 'remove': {
        const id = stringField(payload, 'id')
        await this.enqueue(async () => {
          const storage = await this.readStorage()
          if (!storage.servers.some((server) => server.id === id)) {
            throw new ManagerError(`server ${JSON.stringify(id)} does not exist`, { code: 'not-found' })
          }
          const known = new Set(storage.servers.map((server) => server.id))
          const sets = await this.readSets(known)
          const remainingSets = removeServerFromSets(sets.sets, id)
          const remainingServers = applyActiveSetsToServers(
            storage.servers.filter((server) => server.id !== id),
            remainingSets,
            sets.activeSetIds,
          )
          const written = await this.writeServers(remainingServers)
          await this.writeSets(remainingSets, sets.activeSetIds)
          await this.syncFromFile(written)
        })
        return this.snapshot()
      }
      case 'reconnect': {
        const id = stringField(payload, 'id')
        await this.enqueue(() => this.reconnectServer(id))
        return this.snapshot()
      }
      default:
        throw new ManagerError(`unknown mcp-manager endpoint ${JSON.stringify(endpoint)}`, { code: 'unknown-endpoint' })
    }
  }

  private async reconnectServer(id: string): Promise<void> {
    await this.syncFromFile()
    const record = this.records.get(id)
    if (record === undefined) throw new ManagerError(`server ${JSON.stringify(id)} does not exist`, { code: 'not-found' })
    if (!record.config.enabled) throw new ManagerError('server is disabled; enable it first.', { code: 'disabled' })
    const entry = this.loaderEntry(id)
    if (entry === undefined || !this.entryMatches(record.config, entry)) {
      throw new ManagerError('the Loader has not applied this patch row yet; retry after the patch watcher settles.', { code: 'not-active' })
    }
    record.error = undefined
    record.state = 'starting'
    this.touch(record)
    try {
      await entry.update({}, false, true)
      if (record.state === 'starting') record.state = 'connected'
    } catch (error) {
      record.state = 'failed'
      record.error = errorText(error)
      throw error
    } finally {
      this.touch(record)
    }
  }

  // ── snapshot projection ───────────────────────────────────────────────────

  private async credentialState(ref: string): Promise<CredentialStateView> {
    const credentials = this.ctx.get('credentials')
    if (credentials === undefined) return { configured: false, writable: false }
    try {
      return await (credentials as { describe(ref: ReturnType<typeof credentialRef>): Promise<CredentialStateView> })
        .describe(credentialRef(ref))
    } catch {
      return { configured: false, writable: false }
    }
  }

  private async resolvedSecrets(config: ManagedServerRecord): Promise<string[]> {
    const credentials = this.ctx.get('credentials')
    if (credentials === undefined) return []
    const refs = new Set([
      ...Object.values(config.secretEnv ?? {}),
      ...Object.values(config.secretHeaders ?? {}).map((entry) => entry.ref),
    ])
    const result: string[] = []
    for (const ref of refs) {
      try {
        const hit = await (credentials as {
          resolve(ref: ReturnType<typeof credentialRef>): Promise<{ value: string } | undefined>
        }).resolve(credentialRef(ref))
        if (hit?.value && hit.value.length >= 4) result.push(hit.value)
      } catch {
        // A missing/unavailable credential contributes no redaction token.
      }
    }
    return result
  }

  private redact(text: string, secrets: string[]): string {
    let result = text
    for (const secret of secrets) result = result.split(secret).join('***')
    return result
  }

  private async viewFor(record: RuntimeRecord): Promise<McpServerView> {
    // Registry events can race record creation during profile startup. A
    // snapshot therefore performs one cheap authoritative reconciliation as
    // well as relying on tools/change for normal updates.
    this.refreshTools(record)
    const config = cloneServerRecord(record.config)
    const secretEnv: McpServerView['secretEnv'] = {}
    for (const [name, ref] of Object.entries(config.secretEnv ?? {})) {
      secretEnv[name] = { ref, credential: await this.credentialState(ref) }
    }
    const secretHeaders: McpServerView['secretHeaders'] = {}
    for (const [name, entry] of Object.entries(normalizeSecretHeaderEntries(config.secretHeaders))) {
      secretHeaders[name] = { ...entry, credential: await this.credentialState(entry.ref) }
    }
    const secrets = record.error === undefined ? [] : await this.resolvedSecrets(config)

    const view: McpServerView = {
      id: config.id,
      name: config.name || config.serverName,
      serverName: config.serverName,
      transport: config.transport,
      enabled: config.enabled,
      runtimeOverride: null,
      effectiveEnabled: config.enabled,
      state: record.state,
      tools: record.tools.map((tool) => ({ ...tool, parameters: tool.parameters ?? {} })),
      updatedAt: record.updatedAt,
      toolCallTimeoutMs: config.toolCallTimeoutMs,
      failOnStartupError: config.failOnStartupError,
      reconnect: config.reconnect,
    }
    if (record.error !== undefined) view.error = this.redact(record.error, secrets)
    if (config.transport === 'stdio') {
      view.command = config.command
      view.args = config.args ?? []
      view.cwd = config.cwd
      view.env = { ...(config.env ?? {}) }
      view.secretEnv = secretEnv
    } else {
      view.url = config.url
      view.headers = { ...(config.headers ?? {}) }
      view.secretHeaders = secretHeaders
    }
    return view
  }

  private async snapshot(): Promise<McpManagerSnapshot> {
    const storage = this.lastStorage
    const serverIds = new Set(storage?.servers.map((server) => server.id) ?? [])
    const setStorage = await this.readSets(
      serverIds,
      (storage?.servers.length ?? 0) === 0 || storage!.servers.every((server) => server.enabled),
    )
    const sets = setStorage.sets.map((set) => ({
      ...set,
      serverIds: [...set.serverIds],
      active: setStorage.activeSetIds.includes(set.id),
    }))
    const activeSetIds = sets.filter((set) => set.active).map((set) => set.id)
    return {
      revision: this.revision,
      profile: { key: this.profile.key, source: this.profile.source },
      storage: {
        available: this.store !== undefined,
        writable: storage?.writable ?? false,
        ...(this.store === undefined ? {} : { path: this.store.path }),
        managedBlock: storage?.hasManagedBlock ?? false,
      },
      servers: await Promise.all([...this.records.values()].map((record) => this.viewFor(record))),
      sets,
      activeSetIds,
    }
  }
}

async function resolveExecutable(command: string, cwd?: string, configuredPath?: string): Promise<string | undefined> {
  if (!command) return undefined
  const mode = process.platform === 'win32' ? constants.F_OK : constants.X_OK
  const extensions = process.platform === 'win32'
    ? (process.env.PATHEXT ?? '.COM;.EXE;.BAT;.CMD').split(';')
    : ['']
  const candidates: string[] = []
  if (command.includes('/') || command.includes('\\')) {
    const base = cwd ? resolve(cwd) : process.cwd()
    const target = isAbsolute(command) ? command : resolve(base, command)
    for (const extension of extensions) candidates.push(target.endsWith(extension) ? target : target + extension)
  } else {
    const pathValue = configuredPath ?? process.env.PATH ?? ''
    for (const directory of pathValue.split(delimiter).filter(Boolean)) {
      for (const extension of extensions) candidates.push(join(directory, command + extension))
    }
  }
  for (const candidate of candidates) {
    try {
      await access(candidate, mode)
      return candidate
    } catch {
      // Try the next PATH candidate.
    }
  }
  return undefined
}

function runtimeSuggestion(view: McpServerView): NonNullable<McpDoctorCheck['suggestion']> {
  const message = (view.error ?? '').toLowerCase()
  if (/\b(401|403|unauthori[sz]ed|forbidden|api[-_ ]?key|credential)\b/.test(message)) return 'check-auth'
  if (/\b(enoent|command not found|spawn)\b/.test(message)) return 'edit-command'
  if (/\b(timeout|timed out|econn|enotfound|dns|network|fetch failed|socket)\b/.test(message)) return 'check-network'
  return view.state === 'starting' || view.state === 'reconnecting' ? 'wait-runtime' : 'reconnect-runtime'
}

function asPayload(payload: unknown): Record<string, unknown> {
  if (typeof payload !== 'object' || payload === null || Array.isArray(payload)) {
    throw new ManagerError('payload must be an object.', { code: 'invalid-payload' })
  }
  return payload as Record<string, unknown>
}

function asRecord(payload: unknown, field: string): Record<string, unknown> {
  const value = asPayload(payload)[field]
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new ManagerError(`${field} must be an object.`, { code: 'invalid-payload' })
  }
  return value as Record<string, unknown>
}

function stringField(payload: unknown, field: string): string {
  const value = asPayload(payload)[field]
  if (typeof value !== 'string' || value === '') {
    throw new ManagerError(`${field} must be a non-empty string.`, { code: 'invalid-payload' })
  }
  return value
}

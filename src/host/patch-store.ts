import * as yaml from 'js-yaml'
import { access, constants, mkdir, open, readFile, rename, stat, unlink } from 'node:fs/promises'
import { dirname } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import { randomBytes } from 'node:crypto'
import type { ManagedServerRecord } from './types.js'
import { cloneServerRecord, normalizeServerRecord, toMcpClientSkeleton } from './schema.js'

const BLOCK_START = '# >>> dsh-mcp-manager: managed MCP server rows >>>'
const BLOCK_END = '# <<< dsh-mcp-manager: managed MCP server rows <<<'
const META_KEY = 'x-dsh-mcp-manager'
const ROW_PREFIX = 'mcp-manager--'
const DIRECT_PLUGIN = '@deepseek-ai/dsh-mcp-client'
const CREDENTIAL_PLUGIN = 'dsh-tui-mcp-manager/server'
const LEGACY_CREDENTIAL_PLUGIN = 'dsh-mcp-manager/server'
const LOCK_TIMEOUT_MS = 5_000

const JsExpr = new yaml.Type('tag:yaml.org,2002:js', {
  kind: 'scalar',
  resolve: (data) => typeof data === 'string',
  construct: (data) => ({ __jsExpr: data }),
  predicate: (value) => typeof value === 'object' && value !== null && '__jsExpr' in value,
  represent: (value) => (value as { __jsExpr: string }).__jsExpr,
})

/** Match the exact YAML dialect used by Cordis Include and DSH patch files. */
const PatchSchema = yaml.JSON_SCHEMA.extend(JsExpr)

interface ManagedMetadata {
  id: string
  name?: string
}

export interface ManagedLoaderEntry {
  id: string
  name: string
  disabled?: boolean
  config: Record<string, unknown>
  [META_KEY]: ManagedMetadata
}

interface ManagedPatch {
  insert: ManagedLoaderEntry[]
}

export interface PatchStoreSnapshot {
  servers: ManagedServerRecord[]
  hasManagedBlock: boolean
  needsAdapterMigration: boolean
  writable: boolean
  path: string
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function hasCredentialRefs(record: ManagedServerRecord): boolean {
  return Object.keys(record.secretEnv ?? {}).length > 0 || Object.keys(record.secretHeaders ?? {}).length > 0
}

export function loaderRowId(id: string): string {
  return `${ROW_PREFIX}${id}`
}

function adapterConfig(record: ManagedServerRecord): Record<string, unknown> {
  const config = toMcpClientSkeleton(record)
  if (record.transport === 'stdio') {
    return { ...config, secretEnv: { ...(record.secretEnv ?? {}) } }
  }
  return {
    ...config,
    secretHeaders: Object.fromEntries(
      Object.entries(record.secretHeaders ?? {}).map(([key, value]) => [key, { ref: value.ref, prefix: value.prefix ?? '' }]),
    ),
  }
}

export function toLoaderEntry(input: ManagedServerRecord): ManagedLoaderEntry {
  const record = normalizeServerRecord(cloneServerRecord(input))
  const credentialAware = hasCredentialRefs(record)
  return {
    id: loaderRowId(record.id),
    name: credentialAware ? CREDENTIAL_PLUGIN : DIRECT_PLUGIN,
    ...(record.enabled ? {} : { disabled: true }),
    config: credentialAware ? adapterConfig(record) : toMcpClientSkeleton(record),
    [META_KEY]: { id: record.id, ...(record.name ? { name: record.name } : {}) },
  }
}

function asObject(value: unknown, where: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error(`${where} must be an object`)
  }
  return value as Record<string, unknown>
}

function fromLoaderEntry(input: unknown, index: number): ManagedServerRecord {
  const row = asObject(input, `managed row ${index}`)
  const metadata = asObject(row[META_KEY], `managed row ${index}.${META_KEY}`)
  if (typeof metadata.id !== 'string') throw new Error(`managed row ${index}.${META_KEY}.id must be a string`)
  if (metadata.name !== undefined && typeof metadata.name !== 'string') {
    throw new Error(`managed row ${index}.${META_KEY}.name must be a string`)
  }
  if (row.id !== loaderRowId(metadata.id)) {
    throw new Error(`managed row ${index} id must be ${JSON.stringify(loaderRowId(metadata.id))}`)
  }
  if (row.name !== DIRECT_PLUGIN && row.name !== CREDENTIAL_PLUGIN && row.name !== LEGACY_CREDENTIAL_PLUGIN) {
    throw new Error(`managed row ${index} must load ${DIRECT_PLUGIN}, ${CREDENTIAL_PLUGIN}, or ${LEGACY_CREDENTIAL_PLUGIN}`)
  }
  if (row.disabled !== undefined && typeof row.disabled !== 'boolean') {
    throw new Error(`managed row ${index}.disabled must be a boolean`)
  }
  const config = asObject(row.config, `managed row ${index}.config`)
  const record = normalizeServerRecord({
    ...config,
    id: metadata.id,
    name: metadata.name ?? '',
    enabled: row.disabled !== true,
  })
  if (row.name === DIRECT_PLUGIN && hasCredentialRefs(record)) {
    throw new Error(`managed row ${index} uses credential references but loads ${DIRECT_PLUGIN}; use ${CREDENTIAL_PLUGIN}`)
  }
  return record
}

interface BlockRange {
  start: number
  end: number
  bodyStart: number
  bodyEnd: number
}

function markerMatches(content: string, marker: string): RegExpMatchArray[] {
  const escaped = marker.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return [...content.matchAll(new RegExp(`^${escaped}\\r?$`, 'gm'))]
}

function blockRange(content: string): BlockRange | undefined {
  const starts = markerMatches(content, BLOCK_START)
  const ends = markerMatches(content, BLOCK_END)
  if (starts.length === 0 && ends.length === 0) return undefined
  if (starts.length !== 1 || ends.length !== 1) {
    throw new Error(`expected exactly one ${JSON.stringify(BLOCK_START)} / ${JSON.stringify(BLOCK_END)} marker pair`)
  }
  const start = starts[0].index!
  const bodyStart = start + starts[0][0].length + (content[start + starts[0][0].length] === '\n' ? 1 : 0)
  const bodyEnd = ends[0].index!
  if (bodyEnd < bodyStart) throw new Error('dsh-mcp-manager managed block end appears before its start')
  const markerEnd = bodyEnd + ends[0][0].length
  const end = markerEnd + (content[markerEnd] === '\n' ? 1 : 0)
  return { start, end, bodyStart, bodyEnd }
}

function parsePatchDocument(content: string, label: string): unknown[] {
  let parsed: unknown
  try {
    parsed = yaml.load(content, { schema: PatchSchema, filename: label })
  } catch (error) {
    throw new Error(`failed to parse ${label}: ${errorText(error)}`, { cause: error })
  }
  if (!Array.isArray(parsed)) throw new Error(`${label} must contain a top-level YAML array`)
  return parsed
}

function parseManagedServers(content: string, filename: string): {
  servers: ManagedServerRecord[]
  hasManagedBlock: boolean
  needsAdapterMigration: boolean
} {
  // Validate the complete file first, including user-owned rows outside our block.
  parsePatchDocument(content, filename)
  const range = blockRange(content)
  if (range === undefined) return { servers: [], hasManagedBlock: false, needsAdapterMigration: false }
  const value = parsePatchDocument(content.slice(range.bodyStart, range.bodyEnd), `${filename} managed block`)
  if (value.length !== 1) throw new Error('dsh-mcp-manager managed block must contain exactly one insert patch')
  const patch = asObject(value[0], 'managed block patch')
  if (Object.keys(patch).length !== 1 || !Array.isArray(patch.insert)) {
    throw new Error('dsh-mcp-manager managed block must have the shape "- insert: [...]"')
  }
  const servers = patch.insert.map(fromLoaderEntry)
  const ids = new Set<string>()
  const serverNames = new Set<string>()
  for (const server of servers) {
    if (ids.has(server.id)) throw new Error(`managed block contains duplicate server id ${JSON.stringify(server.id)}`)
    if (serverNames.has(server.serverName)) {
      throw new Error(`managed block contains duplicate serverName ${JSON.stringify(server.serverName)}`)
    }
    ids.add(server.id)
    serverNames.add(server.serverName)
  }
  const needsAdapterMigration = patch.insert.some((entry) => {
    const row = asObject(entry, 'managed row')
    return row.name === LEGACY_CREDENTIAL_PLUGIN
  })
  return { servers, hasManagedBlock: true, needsAdapterMigration }
}

function renderBlock(servers: ManagedServerRecord[]): string {
  const patch: ManagedPatch[] = [{ insert: servers.map(toLoaderEntry) }]
  const body = yaml.dump(patch, {
    schema: PatchSchema,
    noRefs: true,
    lineWidth: 120,
    noCompatMode: true,
    sortKeys: false,
  }).trimEnd()
  return `${BLOCK_START}\n${body}\n${BLOCK_END}`
}

function replaceManagedBlock(content: string, block: string): string {
  const range = blockRange(content)
  if (range !== undefined) {
    const suffix = content.slice(range.end)
    return `${content.slice(0, range.start)}${block}\n${suffix}`
  }

  const parsed = parsePatchDocument(content, 'profile patch')
  if (parsed.length === 0) {
    const matches = [...content.matchAll(/^[ \t]*\[\][ \t]*\r?$/gm)]
    if (matches.length === 1) {
      const match = matches[0]
      return `${content.slice(0, match.index!)}${block}${content.slice(match.index! + match[0].length)}`
    }
  }
  const separator = content.endsWith('\n') ? '\n' : '\n\n'
  return `${content}${separator}${block}\n`
}

async function writable(filename: string): Promise<boolean> {
  try {
    await access(filename, constants.W_OK)
    return true
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') return false
    try {
      await access(dirname(filename), constants.W_OK)
      return true
    } catch {
      return false
    }
  }
}

async function withFileLock<T>(filename: string, operation: () => Promise<T>): Promise<T> {
  await mkdir(dirname(filename), { recursive: true })
  const lockPath = `${filename}.mcp-manager.lock`
  const deadline = Date.now() + LOCK_TIMEOUT_MS
  let handle
  while (true) {
    try {
      handle = await open(lockPath, 'wx', 0o600)
      break
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST' || Date.now() >= deadline) {
        throw new Error(`failed to acquire patch writer lock ${lockPath}: ${errorText(error)}`, { cause: error })
      }
      await delay(25)
    }
  }
  try {
    return await operation()
  } finally {
    await handle.close()
    await unlink(lockPath).catch(() => {})
  }
}

async function writeAtomic(filename: string, content: string): Promise<void> {
  await mkdir(dirname(filename), { recursive: true })
  let mode = 0o600
  try {
    mode = (await stat(filename)).mode & 0o777
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
  }
  const temp = `${filename}.mcp-manager-${process.pid}-${randomBytes(8).toString('hex')}.tmp`
  const handle = await open(temp, 'wx', mode)
  try {
    await handle.writeFile(content, 'utf8')
    await handle.sync()
    await handle.close()
    await rename(temp, filename)
  } catch (error) {
    await handle.close().catch(() => {})
    await unlink(temp).catch(() => {})
    throw error
  }
}

export class ProfilePatchStore {
  constructor(readonly path: string) {}

  private async readText(): Promise<string> {
    try {
      return await readFile(this.path, 'utf8')
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return '[]\n'
      throw error
    }
  }

  async read(): Promise<PatchStoreSnapshot> {
    const content = await this.readText()
    const parsed = parseManagedServers(content, this.path)
    return {
      ...parsed,
      servers: parsed.servers.map(cloneServerRecord),
      writable: await writable(this.path),
      path: this.path,
    }
  }

  async write(servers: ManagedServerRecord[]): Promise<PatchStoreSnapshot> {
    const normalized = servers.map((server) => normalizeServerRecord(cloneServerRecord(server)))
    return withFileLock(this.path, async () => {
      const current = await this.readText()
      parseManagedServers(current, this.path)
      const next = replaceManagedBlock(current, renderBlock(normalized))
      // Fail before committing if either our block or any surrounding user
      // patch became invalid during the read-modify-write cycle.
      parseManagedServers(next, this.path)
      await writeAtomic(this.path, next)
      return {
        servers: normalized.map(cloneServerRecord),
        hasManagedBlock: true,
        needsAdapterMigration: false,
        writable: true,
        path: this.path,
      }
    })
  }
}

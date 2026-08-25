import { Service } from '@deepseek-ai/cordis';
import { settingsNamespace } from '@deepseek-ai/dsh-settings';
import { credentialRef } from '@deepseek-ai/dsh-credentials';
import { resolve } from 'node:path';
import { McpManagerSettingsSchema, cloneServerRecord, normalizeSecretHeaderEntries, normalizeServerRecord, validateMcpManagerSettings, } from './schema.js';
import { detectProfile } from './profile.js';
import { loaderRowId, ProfilePatchStore, toLoaderEntry } from './patch-store.js';
import { ManagerError, } from './types.js';
const LEGACY_SETTINGS_NAMESPACE = 'mcp-manager';
const RPC_CHANNEL = '/mcp-manager';
const MAX_LOGS_PER_SERVER = 12;
const DIRECT_PLUGIN = '@deepseek-ai/dsh-mcp-client';
const CREDENTIAL_PLUGIN = 'dsh-tui-mcp-manager/server';
const LEGACY_CREDENTIAL_PLUGIN = 'dsh-mcp-manager/server';
const FIBER_STATE_ACTIVE = 2;
function errorText(error) {
    return error instanceof Error ? error.message : String(error);
}
function argText(arg) {
    if (typeof arg === 'string')
        return arg;
    if (arg instanceof Error)
        return `${arg.name}: ${arg.message}`;
    try {
        return JSON.stringify(arg);
    }
    catch {
        return String(arg);
    }
}
function stable(value) {
    if (Array.isArray(value))
        return `[${value.map(stable).join(',')}]`;
    if (value !== null && typeof value === 'object') {
        const record = value;
        return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${stable(record[key])}`).join(',')}}`;
    }
    return JSON.stringify(value);
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
    static inject = ['tools', 'loader'];
    profile;
    store;
    legacySettings;
    records = new Map();
    revision = 0;
    chain = Promise.resolve();
    lastStorage;
    constructor(ctx) {
        super(ctx, 'mcpManager');
        this.profile = detectProfile(ctx);
        this.store = this.profile.patchPath === undefined ? undefined : new ProfilePatchStore(this.profile.patchPath);
        this.installLegacySettingsMigration();
        this.installLogCapture();
        this.installToolRegistryTracking();
        this.installCredentialTracking();
        this.installPatchFailureTracking();
        this.installRpcChannel();
    }
    // ── wiring ────────────────────────────────────────────────────────────────
    /** Register the old section read-only so an existing install can migrate once. */
    installLegacySettingsMigration() {
        this.ctx.inject(['settings'], (settingsCtx) => {
            const scope = settingsCtx.settings.register(settingsNamespace(LEGACY_SETTINGS_NAMESPACE), McpManagerSettingsSchema, {
                applies: 'restart',
                validate: validateMcpManagerSettings,
            });
            this.legacySettings = scope;
            settingsCtx.effect(() => () => {
                this.legacySettings = undefined;
            }, 'mcp-manager.legacy-settings');
            void this.enqueue(() => this.syncFromFile());
        });
    }
    installLogCapture() {
        this.ctx.logger.exporter({
            export: (message) => {
                const text = message.args.map(argText).join(' ');
                for (const record of this.records.values()) {
                    const clientMarker = `mcp-client(${record.config.serverName})`;
                    const adapterMarker = `dsh-tui-mcp-manager-server(${record.config.serverName})`;
                    if (!text.includes(clientMarker) && !text.includes(adapterMarker))
                        continue;
                    const scrubbed = this.redact(text, [...record.redactionTokens]);
                    record.logs.push({ ts: message.ts, level: message.type, text: scrubbed });
                    if (record.logs.length > MAX_LOGS_PER_SERVER)
                        record.logs.shift();
                    this.applyLogTransition(record, scrubbed);
                    this.touch(record);
                }
            },
        });
    }
    installToolRegistryTracking() {
        this.ctx.on('tools/change', () => {
            for (const record of this.records.values()) {
                this.refreshTools(record);
            }
        });
    }
    installCredentialTracking() {
        this.ctx.on('credentials/updated', (ref) => {
            for (const record of this.records.values()) {
                const used = Object.values(record.config.secretEnv ?? {}).includes(ref)
                    || Object.values(record.config.secretHeaders ?? {}).some((entry) => entry.ref === ref);
                if (used)
                    void this.refreshRedactionTokens(record);
            }
        });
    }
    installPatchFailureTracking() {
        ;
        this.ctx.on('hmr/config-update-failed', (filename, error) => {
            if (this.store === undefined || resolve(filename) !== resolve(this.store.path))
                return;
            for (const record of this.records.values()) {
                if (this.entryMatches(record.config, this.loaderEntry(record.id)))
                    continue;
                record.state = 'failed';
                record.error = `DSH could not apply cordis.patch.yml: ${errorText(error)}`;
                this.touch(record);
            }
        });
    }
    installRpcChannel() {
        this.ctx.inject(['connection'], (connCtx) => {
            const connection = connCtx.connection;
            connection.rpc.handle(RPC_CHANNEL, async (endpoint, payload) => {
                try {
                    return { ok: true, value: await this.dispatchRpc(endpoint, payload) };
                }
                catch (error) {
                    const managerError = error instanceof ManagerError ? error : new ManagerError(errorText(error), { cause: error });
                    return {
                        ok: false,
                        error: {
                            code: 'internal',
                            message: managerError.message,
                            details: { kind: managerError.code },
                        },
                    };
                }
            }, { authority: 'loopback' });
        });
    }
    // ── file source and migration ─────────────────────────────────────────────
    enqueue(task) {
        const run = this.chain.then(task, task);
        this.chain = run.then(() => undefined, () => undefined);
        return run;
    }
    requireStore() {
        if (this.store === undefined) {
            throw new ManagerError('The active DSH profile could not be resolved from ctx.baseUrl; cordis.patch.yml editing is unavailable.', { code: 'profile-unavailable' });
        }
        return this.store;
    }
    legacyServers() {
        if (this.legacySettings === undefined)
            return [];
        const value = this.legacySettings.get();
        return (value.profiles?.[this.profile.key]?.servers ?? []).map((server) => normalizeServerRecord(cloneServerRecord(server)));
    }
    async readStorage() {
        const store = this.requireStore();
        let snapshot = await store.read();
        if (!snapshot.hasManagedBlock) {
            const legacy = this.legacyServers();
            if (legacy.length > 0) {
                this.assertNoExternalNamespaceConflict(legacy);
                snapshot = await store.write(legacy);
                this.ctx.logger.info('mcp-manager: imported %d legacy settings server(s) into %s; the legacy settings section is retained as a backup', legacy.length, store.path);
            }
        }
        else if (snapshot.needsAdapterMigration) {
            snapshot = await store.write(snapshot.servers);
            this.ctx.logger.info('dsh-tui-mcp-manager: migrated credential adapter rows from %s to %s in %s', LEGACY_CREDENTIAL_PLUGIN, CREDENTIAL_PLUGIN, store.path);
        }
        this.lastStorage = snapshot;
        return snapshot;
    }
    async writeServers(servers) {
        this.assertNoExternalNamespaceConflict(servers);
        const snapshot = await this.requireStore().write(servers);
        this.lastStorage = snapshot;
        return snapshot;
    }
    loaderEntries() {
        return [...this.ctx.loader.entries()];
    }
    loaderEntry(id) {
        const rowId = loaderRowId(id);
        return this.loaderEntries().find((entry) => entry.options.id === rowId);
    }
    assertNoExternalNamespaceConflict(servers) {
        const ownedRows = new Set(servers.map((server) => loaderRowId(server.id)));
        const external = this.loaderEntries().filter((entry) => !ownedRows.has(entry.options.id)
            && (entry.options.name === DIRECT_PLUGIN
                || entry.options.name === CREDENTIAL_PLUGIN
                || entry.options.name === LEGACY_CREDENTIAL_PLUGIN));
        for (const server of servers) {
            const conflict = external.find((entry) => {
                const config = entry.options.config;
                return typeof config === 'object' && config !== null && config.serverName === server.serverName;
            });
            if (conflict !== undefined) {
                throw new ManagerError(`serverName ${JSON.stringify(server.serverName)} is already used by external Loader row ${JSON.stringify(conflict.options.id)}; import or rename that row first.`, { code: 'duplicate-server-name' });
            }
        }
    }
    entryMatches(record, entry) {
        if (entry === undefined)
            return false;
        const expected = toLoaderEntry(record);
        return entry.options.name === expected.name
            && Boolean(entry.options.disabled) === Boolean(expected.disabled)
            && stable(entry.options.config) === stable(expected.config);
    }
    async syncFromFile(snapshot) {
        if (this.store === undefined)
            return;
        snapshot ??= await this.readStorage();
        const ids = new Set(snapshot.servers.map((server) => server.id));
        for (const id of [...this.records.keys()]) {
            if (!ids.has(id)) {
                this.records.delete(id);
                this.revision += 1;
            }
        }
        for (const config of snapshot.servers) {
            const fingerprint = stable(config);
            let record = this.records.get(config.id);
            if (record === undefined) {
                record = {
                    id: config.id,
                    config,
                    fingerprint,
                    state: config.enabled ? 'starting' : 'disabled',
                    logs: [],
                    tools: [],
                    redactionTokens: new Set(),
                    updatedAt: Date.now(),
                };
                this.records.set(config.id, record);
                this.revision += 1;
            }
            else if (record.fingerprint !== fingerprint) {
                record.config = config;
                record.fingerprint = fingerprint;
                record.state = config.enabled ? 'starting' : 'disabled';
                record.error = undefined;
                record.logs = [];
                record.redactionTokens.clear();
                this.touch(record);
            }
            else {
                record.config = config;
            }
            const stateBeforeProjection = record.state;
            const errorBeforeProjection = record.error;
            this.refreshTools(record);
            await this.refreshRedactionTokens(record);
            if (!config.enabled) {
                record.state = 'disabled';
                record.error = undefined;
                if (record.state !== stateBeforeProjection || record.error !== errorBeforeProjection)
                    this.touch(record);
                continue;
            }
            const entry = this.loaderEntry(config.id);
            // A Fiber receives its uid before an async plugin finishes loading.
            // dsh-mcp-client registers the initial tool generation during that
            // LOADING phase, so uid presence alone can briefly project READY / 0.
            const active = entry?.fiber?.state === FIBER_STATE_ACTIVE;
            if (this.entryMatches(config, entry) && active && record.state !== 'failed' && record.state !== 'reconnecting') {
                record.state = 'connected';
                record.error = undefined;
            }
            else if (!active && record.state !== 'failed' && record.state !== 'reconnecting') {
                record.state = 'starting';
            }
            if (record.state !== stateBeforeProjection || record.error !== errorBeforeProjection)
                this.touch(record);
        }
    }
    // ── runtime projection ────────────────────────────────────────────────────
    touch(record) {
        record.updatedAt = Date.now();
        this.revision += 1;
    }
    toolsFor(serverName) {
        const prefix = `mcp__${serverName}__`;
        return this.ctx.tools.schemas()
            .filter((schema) => schema.name.startsWith(prefix))
            .map((schema) => ({
            name: schema.name,
            description: schema.description,
            parameters: (schema.parameters ?? {}),
        }));
    }
    /** Reconcile the cached view with the native registry without inventing a state transition. */
    refreshTools(record) {
        const tools = this.toolsFor(record.config.serverName);
        if (stable(record.tools) === stable(tools))
            return;
        record.tools = tools;
        this.touch(record);
    }
    applyLogTransition(record, text) {
        const clientLabel = `mcp-client(${record.config.serverName})`;
        const adapterLabel = `dsh-tui-mcp-manager-server(${record.config.serverName})`;
        const label = text.includes(clientLabel) ? clientLabel : adapterLabel;
        const message = text.slice(text.indexOf(label) + label.length + 2);
        if (text.includes('connection lost; reconnecting') || text.includes('connection failed; retrying')) {
            record.state = 'reconnecting';
            record.error = message || record.error;
        }
        else if (text.includes('connection attempt failed')) {
            record.state = 'reconnecting';
            record.error = message || record.error;
        }
        else if (text.includes('giving up after')
            || text.includes('failed generation did not close within')
            || text.includes('tool registration failed')
            || text.includes('connection lost and reconnect is disabled')
            || text.includes('connection failed and reconnect is disabled')
            || (text.includes('credential ') && text.includes(' is not configured'))
            || text.includes('failed to activate mcp-client')) {
            record.state = 'failed';
            record.error = message || record.error;
        }
        else if (text.includes('reconnected and re-synced')) {
            record.state = 'connected';
            record.error = undefined;
        }
        else if (text.includes('tool re-sync failed')) {
            record.error = message || record.error;
        }
    }
    // ── RPC dispatch ──────────────────────────────────────────────────────────
    async invoke(endpoint, payload) {
        return this.dispatchRpc(endpoint, payload);
    }
    async dispatchRpc(endpoint, payload) {
        switch (endpoint) {
            case 'list':
                await this.enqueue(() => this.syncFromFile());
                return this.snapshot();
            case 'upsert': {
                const record = normalizeServerRecord(asRecord(payload, 'server'));
                await this.enqueue(async () => {
                    const storage = await this.readStorage();
                    const servers = storage.servers;
                    const duplicate = servers.find((candidate) => candidate.id !== record.id && candidate.serverName === record.serverName);
                    if (duplicate !== undefined) {
                        throw new ManagerError(`serverName ${JSON.stringify(record.serverName)} is already used by server ${JSON.stringify(duplicate.id)}.`, { code: 'duplicate-server-name' });
                    }
                    const index = servers.findIndex((candidate) => candidate.id === record.id);
                    if (index === -1)
                        servers.push(record);
                    else
                        servers[index] = record;
                    const written = await this.writeServers(servers);
                    await this.syncFromFile(written);
                });
                return this.snapshot();
            }
            case 'remove': {
                const id = stringField(payload, 'id');
                await this.enqueue(async () => {
                    const storage = await this.readStorage();
                    const written = await this.writeServers(storage.servers.filter((server) => server.id !== id));
                    await this.syncFromFile(written);
                });
                return this.snapshot();
            }
            case 'setEnabled':
            case 'setDefaultEnabled': {
                const id = stringField(payload, 'id');
                const enabled = booleanField(payload, 'enabled');
                await this.enqueue(() => this.persistEnabled(id, enabled));
                return this.snapshot();
            }
            case 'setRuntimeOverride': {
                // Compatibility with a previously loaded client: file-backed mode has
                // one persisted Loader switch, so a boolean becomes `enabled`.
                const id = stringField(payload, 'id');
                const { override } = asPayload(payload);
                if (override !== null && typeof override !== 'boolean') {
                    throw new ManagerError('override must be true, false, or null.', { code: 'invalid-payload' });
                }
                if (typeof override === 'boolean')
                    await this.enqueue(() => this.persistEnabled(id, override));
                else
                    await this.enqueue(() => this.syncFromFile());
                return this.snapshot();
            }
            case 'reconnect': {
                const id = stringField(payload, 'id');
                await this.enqueue(() => this.reconnectServer(id));
                return this.snapshot();
            }
            default:
                throw new ManagerError(`unknown mcp-manager endpoint ${JSON.stringify(endpoint)}`, { code: 'unknown-endpoint' });
        }
    }
    async persistEnabled(id, enabled) {
        const storage = await this.readStorage();
        const server = storage.servers.find((candidate) => candidate.id === id);
        if (server === undefined)
            throw new ManagerError(`server ${JSON.stringify(id)} does not exist`, { code: 'not-found' });
        server.enabled = enabled;
        const written = await this.writeServers(storage.servers);
        await this.syncFromFile(written);
    }
    async reconnectServer(id) {
        await this.syncFromFile();
        const record = this.records.get(id);
        if (record === undefined)
            throw new ManagerError(`server ${JSON.stringify(id)} does not exist`, { code: 'not-found' });
        if (!record.config.enabled)
            throw new ManagerError('server is disabled; enable it first.', { code: 'disabled' });
        const entry = this.loaderEntry(id);
        if (entry === undefined || !this.entryMatches(record.config, entry)) {
            throw new ManagerError('the Loader has not applied this patch row yet; retry after the patch watcher settles.', { code: 'not-active' });
        }
        record.logs = [];
        record.error = undefined;
        record.state = 'starting';
        this.touch(record);
        try {
            await entry.update({}, false, true);
            if (record.state === 'starting')
                record.state = 'connected';
        }
        catch (error) {
            record.state = 'failed';
            record.error = errorText(error);
            throw error;
        }
        finally {
            this.touch(record);
        }
    }
    // ── snapshot projection ───────────────────────────────────────────────────
    async credentialState(ref) {
        const credentials = this.ctx.get('credentials');
        if (credentials === undefined)
            return { configured: false, writable: false };
        try {
            return await credentials
                .describe(credentialRef(ref));
        }
        catch {
            return { configured: false, writable: false };
        }
    }
    async resolvedSecrets(config) {
        const credentials = this.ctx.get('credentials');
        if (credentials === undefined)
            return [];
        const refs = new Set([
            ...Object.values(config.secretEnv ?? {}),
            ...Object.values(config.secretHeaders ?? {}).map((entry) => entry.ref),
        ]);
        const result = [];
        for (const ref of refs) {
            try {
                const hit = await credentials.resolve(credentialRef(ref));
                if (hit?.value && hit.value.length >= 4)
                    result.push(hit.value);
            }
            catch {
                // A missing/unavailable credential contributes no redaction token.
            }
        }
        return result;
    }
    async refreshRedactionTokens(record) {
        for (const secret of await this.resolvedSecrets(record.config))
            record.redactionTokens.add(secret);
    }
    redact(text, secrets) {
        let result = text;
        for (const secret of secrets)
            result = result.split(secret).join('***');
        return result;
    }
    async viewFor(record) {
        // Registry events can race record creation during profile startup. A
        // snapshot therefore performs one cheap authoritative reconciliation as
        // well as relying on tools/change for normal updates.
        this.refreshTools(record);
        const config = cloneServerRecord(record.config);
        const secretEnv = {};
        for (const [name, ref] of Object.entries(config.secretEnv ?? {})) {
            secretEnv[name] = { ref, credential: await this.credentialState(ref) };
        }
        const secretHeaders = {};
        for (const [name, entry] of Object.entries(normalizeSecretHeaderEntries(config.secretHeaders))) {
            secretHeaders[name] = { ...entry, credential: await this.credentialState(entry.ref) };
        }
        await this.refreshRedactionTokens(record);
        const secrets = [...record.redactionTokens];
        const view = {
            id: config.id,
            name: config.name || config.serverName,
            serverName: config.serverName,
            transport: config.transport,
            enabled: config.enabled,
            runtimeOverride: null,
            effectiveEnabled: config.enabled,
            state: record.state,
            tools: record.tools.map((tool) => ({ ...tool, parameters: tool.parameters ?? {} })),
            logs: record.logs.map((log) => ({ ...log, text: this.redact(log.text, secrets) })),
            updatedAt: record.updatedAt,
            toolCallTimeoutMs: config.toolCallTimeoutMs,
            failOnStartupError: config.failOnStartupError,
            reconnect: config.reconnect,
        };
        if (record.error !== undefined)
            view.error = this.redact(record.error, secrets);
        if (config.transport === 'stdio') {
            view.command = config.command;
            view.args = config.args ?? [];
            view.cwd = config.cwd;
            view.env = { ...(config.env ?? {}) };
            view.secretEnv = secretEnv;
        }
        else {
            view.url = config.url;
            view.headers = { ...(config.headers ?? {}) };
            view.secretHeaders = secretHeaders;
        }
        return view;
    }
    async snapshot() {
        const storage = this.lastStorage;
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
        };
    }
}
function asPayload(payload) {
    if (typeof payload !== 'object' || payload === null || Array.isArray(payload)) {
        throw new ManagerError('payload must be an object.', { code: 'invalid-payload' });
    }
    return payload;
}
function asRecord(payload, field) {
    const value = asPayload(payload)[field];
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
        throw new ManagerError(`${field} must be an object.`, { code: 'invalid-payload' });
    }
    return value;
}
function stringField(payload, field) {
    const value = asPayload(payload)[field];
    if (typeof value !== 'string' || value === '') {
        throw new ManagerError(`${field} must be a non-empty string.`, { code: 'invalid-payload' });
    }
    return value;
}
function booleanField(payload, field) {
    const value = asPayload(payload)[field];
    if (typeof value !== 'boolean') {
        throw new ManagerError(`${field} must be a boolean.`, { code: 'invalid-payload' });
    }
    return value;
}
//# sourceMappingURL=manager.js.map
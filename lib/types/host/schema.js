import Schema from '@deepseek-ai/schemastery';
import { Config as McpClientConfig } from '@deepseek-ai/dsh-mcp-client';
/** dsh-mcp-client allows names matching `[A-Za-z0-9_-]{1,32}`. */
export const SERVER_NAME_PATTERN = /^[A-Za-z0-9_-]{1,32}$/;
export const SERVER_ID_PATTERN = /^[a-z0-9][a-z0-9._-]{0,63}$/;
export const CREDENTIAL_REF_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/;
/** Node's maximum timer delay, matching @deepseek-ai/dsh-timeout. */
const MAX_TIMER_DELAY_MS = 2_147_483_647;
const ReconnectSchema = Schema.object({
    enabled: Schema.boolean().default(true),
    initialDelayMs: Schema.number().min(1).max(MAX_TIMER_DELAY_MS).default(500),
    maxDelayMs: Schema.number().min(1).max(MAX_TIMER_DELAY_MS).default(30_000),
    maxAttempts: Schema.number().step(1).min(1).default(10),
});
const SecretHeaderSchema = Schema.object({
    ref: Schema.string().pattern(CREDENTIAL_REF_PATTERN).required(),
    prefix: Schema.string().default(''),
});
const SharedMcpFields = {
    serverName: Schema.string().pattern(SERVER_NAME_PATTERN).required(),
    toolCallTimeoutMs: Schema.number().min(1).max(MAX_TIMER_DELAY_MS).default(60_000),
    failOnStartupError: Schema.boolean().default(false),
    reconnect: ReconnectSchema,
};
const BaseServerFields = {
    id: Schema.string().pattern(SERVER_ID_PATTERN).required(),
    name: Schema.string().default(''),
    enabled: Schema.boolean().default(true),
    ...SharedMcpFields,
};
const StdioServerSchema = Schema.object({
    ...BaseServerFields,
    transport: Schema.const('stdio').required(),
    command: Schema.string().required(),
    args: Schema.array(Schema.string()).default([]),
    cwd: Schema.string().default(''),
    env: Schema.dict(Schema.string()).default({}),
    secretEnv: Schema.dict(Schema.string().pattern(CREDENTIAL_REF_PATTERN)).default({}),
});
const HttpServerSchema = Schema.object({
    ...BaseServerFields,
    transport: Schema.const('streamable-http').required(),
    url: Schema.string().required(),
    headers: Schema.dict(Schema.string()).default({}),
    secretHeaders: Schema.dict(SecretHeaderSchema).default({}),
});
export const ServerSchema = Schema.union([StdioServerSchema, HttpServerSchema]);
/**
 * Config accepted by the per-server credential adapter Loader row. It is the
 * upstream MCP config plus credential references, with manager/file metadata
 * deliberately kept outside the plugin config.
 */
export const ManagedMcpServerConfigSchema = Schema.union([
    Schema.object({
        ...SharedMcpFields,
        transport: Schema.const('stdio').required(),
        command: Schema.string().required(),
        args: Schema.array(Schema.string()).default([]),
        cwd: Schema.string().default(''),
        env: Schema.dict(Schema.string()).default({}),
        secretEnv: Schema.dict(Schema.string().pattern(CREDENTIAL_REF_PATTERN)).default({}),
    }),
    Schema.object({
        ...SharedMcpFields,
        transport: Schema.const('streamable-http').required(),
        url: Schema.string().required(),
        headers: Schema.dict(Schema.string()).default({}),
        secretHeaders: Schema.dict(SecretHeaderSchema).default({}),
    }),
]);
export const McpManagerSettingsSchema = Schema.object({
    version: Schema.number().default(1),
    profiles: Schema.dict(Schema.object({
        servers: Schema.array(ServerSchema).default([]),
    })).default({}),
});
/**
 * Validate constraints that span one or more server records.
 *
 * The settings schema owns structural validation, while this hook deliberately
 * reuses the same record validation as RPC upserts. Keeping it on the settings
 * registration path means direct file edits and alternate settings providers
 * cannot bypass inline-secret rejection or upstream mcp-client validation.
 */
export function validateMcpManagerSettings(value) {
    const profiles = value.profiles ?? {};
    for (const [profile, section] of Object.entries(profiles)) {
        const ids = new Set();
        const serverNames = new Set();
        for (const [index, input] of (section.servers ?? []).entries()) {
            let record;
            try {
                record = normalizeServerRecord(input);
            }
            catch (error) {
                throw new Error(`profiles[${JSON.stringify(profile)}].servers[${index}]: ${error instanceof Error ? error.message : String(error)}`, { cause: error });
            }
            if (ids.has(record.id)) {
                throw new Error(`profiles[${JSON.stringify(profile)}] contains duplicate server id ${JSON.stringify(record.id)}`);
            }
            if (serverNames.has(record.serverName)) {
                throw new Error(`profiles[${JSON.stringify(profile)}] contains duplicate serverName ${JSON.stringify(record.serverName)}`);
            }
            ids.add(record.id);
            serverNames.add(record.serverName);
        }
    }
}
const INLINE_SECRET_ENV_KEY = /(?:^|_)(TOKEN|SECRET|PASSWORD|PASSWD|API_?KEY|AUTH)(?:$|_)|^AUTH/i;
const INLINE_SECRET_HEADER = /^(authorization|proxy-authorization|cookie|api-key|x-api-key|x-auth-token)$/i;
/**
 * dsh-mcp-client has no credential indirection of its own. This manager adds
 * the indirection (`secretEnv` / `secretHeaders`) and refuses secret-shaped
 * values in the plain `env`/`headers` maps so credentials are never persisted
 * into cordis.patch.yml.
 */
export function assertNoInlineSecrets(record) {
    for (const key of Object.keys(record.env ?? {})) {
        if (INLINE_SECRET_ENV_KEY.test(key)) {
            throw new Error(`env entry "${key}" looks like a secret. Put its value in the DSH credential store and declare it in secretEnv: {"${key}": "REFERENCE_NAME"} instead of env.`);
        }
    }
    for (const key of Object.keys(record.headers ?? {})) {
        if (INLINE_SECRET_HEADER.test(key)) {
            throw new Error(`header "${key}" looks like a secret. Put its value in the DSH credential store and declare it in secretHeaders instead of headers.`);
        }
    }
}
function validateCredentialRefs(record) {
    for (const [envName, ref] of Object.entries(record.secretEnv ?? {})) {
        if (!CREDENTIAL_REF_PATTERN.test(ref)) {
            throw new Error(`secretEnv["${envName}"] must be a credential reference (POSIX shell identifier), got ${JSON.stringify(ref)}`);
        }
    }
    for (const [headerName, entry] of Object.entries(record.secretHeaders ?? {})) {
        if (typeof entry !== 'object' || entry === null || !CREDENTIAL_REF_PATTERN.test(entry.ref)) {
            throw new Error(`secretHeaders["${headerName}"] must be { ref: string, prefix?: string } with a valid ref`);
        }
    }
}
/** Validate one payload and return the exact persisted record shape. */
export function normalizeServerRecord(input) {
    const value = ServerSchema(input);
    const record = value;
    if (record.transport === 'stdio') {
        record.env = record.env ?? {};
        record.secretEnv = record.secretEnv ?? {};
        delete record.url;
        delete record.headers;
        delete record.secretHeaders;
    }
    else {
        record.headers = record.headers ?? {};
        record.secretHeaders = record.secretHeaders ?? {};
        delete record.command;
        delete record.args;
        delete record.cwd;
        delete record.env;
        delete record.secretEnv;
    }
    assertNoInlineSecrets(record);
    validateCredentialRefs(record);
    // Validate the transport slice against the actual dsh-mcp-client schema.
    // This is the source of truth for what upstream accepts.
    try {
        McpClientConfig(toMcpClientSkeleton(record));
    }
    catch (error) {
        throw new Error(`MCP client rejected the configuration: ${error instanceof Error ? error.message : String(error)}`);
    }
    return record;
}
/** Strip manager-only fields and produce the exact dsh-mcp-client config shape. */
export function toMcpClientSkeleton(record) {
    const common = {
        serverName: record.serverName,
        toolCallTimeoutMs: record.toolCallTimeoutMs ?? 60_000,
        failOnStartupError: record.failOnStartupError ?? false,
        reconnect: record.reconnect,
    };
    if (record.transport === 'stdio') {
        return {
            transport: 'stdio',
            ...common,
            command: record.command,
            args: record.args ?? [],
            env: record.env ?? {},
            cwd: record.cwd ?? '',
        };
    }
    return {
        transport: 'streamable-http',
        ...common,
        url: record.url,
        headers: record.headers ?? {},
    };
}
export function cloneServerRecord(record) {
    return JSON.parse(JSON.stringify(record));
}
export function normalizeSecretHeaderEntries(entries) {
    const result = {};
    for (const [key, entry] of Object.entries(entries ?? {})) {
        result[key] = { ref: entry.ref, prefix: entry.prefix ?? '' };
    }
    return result;
}
//# sourceMappingURL=schema.js.map
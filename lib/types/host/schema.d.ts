import Schema from '@deepseek-ai/schemastery';
import type { ManagedServerRecord, SecretHeaderRef } from './types.js';
/** dsh-mcp-client allows names matching `[A-Za-z0-9_-]{1,32}`. */
export declare const SERVER_NAME_PATTERN: RegExp;
export declare const SERVER_ID_PATTERN: RegExp;
export declare const CREDENTIAL_REF_PATTERN: RegExp;
export declare const ServerSchema: Schema;
/**
 * Config accepted by the per-server credential adapter Loader row. It is the
 * upstream MCP config plus credential references, with manager/file metadata
 * deliberately kept outside the plugin config.
 */
export declare const ManagedMcpServerConfigSchema: Schema;
export declare const McpManagerSettingsSchema: Schema;
/**
 * Validate constraints that span one or more server records.
 *
 * The settings schema owns structural validation, while this hook deliberately
 * reuses the same record validation as RPC upserts. Keeping it on the settings
 * registration path means direct file edits and alternate settings providers
 * cannot bypass inline-secret rejection or upstream mcp-client validation.
 */
export declare function validateMcpManagerSettings(value: unknown): void;
/**
 * dsh-mcp-client has no credential indirection of its own. This manager adds
 * the indirection (`secretEnv` / `secretHeaders`) and refuses secret-shaped
 * values in the plain `env`/`headers` maps so credentials are never persisted
 * into cordis.patch.yml.
 */
export declare function assertNoInlineSecrets(record: ManagedServerRecord): void;
/** Validate one payload and return the exact persisted record shape. */
export declare function normalizeServerRecord(input: unknown): ManagedServerRecord;
/** Strip manager-only fields and produce the exact dsh-mcp-client config shape. */
export declare function toMcpClientSkeleton(record: ManagedServerRecord): Record<string, unknown>;
export declare function cloneServerRecord(record: ManagedServerRecord): ManagedServerRecord;
export declare function normalizeSecretHeaderEntries(entries: Record<string, SecretHeaderRef> | undefined): Record<string, SecretHeaderRef>;
//# sourceMappingURL=schema.d.ts.map
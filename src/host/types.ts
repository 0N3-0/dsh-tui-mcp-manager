export type McpTransport = 'stdio' | 'streamable-http'

export interface SecretHeaderRef {
  /** Credential reference resolved through ctx.credentials, e.g. GITHUB_TOKEN. */
  ref: string
  /** Text placed before the resolved credential, e.g. "Bearer ". */
  prefix?: string
}

export interface ReconnectConfig {
  enabled?: boolean
  initialDelayMs?: number
  maxDelayMs?: number
  maxAttempts?: number
}

/**
 * One user-managed MCP server persisted as a Loader row in the active
 * profile's cordis.patch.yml. The transport fields mirror
 * `@deepseek-ai/dsh-mcp-client` exactly. `secretEnv`/`secretHeaders` are
 * manager-level credential references; resolved values never enter the patch.
 */
export interface ManagedServerRecord {
  id: string
  /** Optional display name shown only in the manager UI. */
  name?: string
  /** MCP tool namespace; becomes `mcp__<serverName>__<tool>`. */
  serverName: string
  transport: McpTransport
  /** Persisted Loader enabled state (`false` serializes as `disabled: true`). */
  enabled: boolean

  // stdio transport (mirrors dsh-mcp-client)
  command?: string
  args?: string[]
  cwd?: string
  env?: Record<string, string>
  secretEnv?: Record<string, string>

  // streamable-http transport (mirrors dsh-mcp-client)
  url?: string
  headers?: Record<string, string>
  secretHeaders?: Record<string, SecretHeaderRef>

  // shared fields (mirrors dsh-mcp-client)
  toolCallTimeoutMs?: number
  failOnStartupError?: boolean
  reconnect?: ReconnectConfig
}

export type ServerRuntimeState =
  | 'disabled'
  | 'starting'
  | 'connected'
  | 'reconnecting'
  | 'failed'
  | 'stopped'

export interface McpToolView {
  name: string
  description: string
  parameters: Record<string, unknown>
}

export interface McpLogEntry {
  ts: number
  level: 'error' | 'warn' | 'info' | 'debug'
  text: string
}

export interface CredentialStateView {
  configured: boolean
  source?: string
  writable: boolean
}

export interface McpServerView {
  id: string
  name: string
  serverName: string
  transport: McpTransport
  enabled: boolean
  /** @deprecated Compatibility projection; always null in file-backed mode. */
  runtimeOverride?: null
  /** @deprecated Compatibility projection; always equals `enabled`. */
  effectiveEnabled?: boolean
  state: ServerRuntimeState
  error?: string
  tools: McpToolView[]
  logs: McpLogEntry[]
  updatedAt: number

  command?: string
  args?: string[]
  cwd?: string
  env?: Record<string, string>
  secretEnv?: Record<string, { ref: string; credential: CredentialStateView }>

  url?: string
  headers?: Record<string, string>
  secretHeaders?: Record<string, SecretHeaderRef & { credential: CredentialStateView }>

  toolCallTimeoutMs?: number
  failOnStartupError?: boolean
  reconnect?: ReconnectConfig
}

export interface McpManagerSnapshot {
  revision: number
  profile: {
    key: string
    source: 'ctx.baseUrl' | 'fallback'
  }
  storage: {
    available: boolean
    writable: boolean
    path?: string
    managedBlock: boolean
  }
  servers: McpServerView[]
}

export interface ManagerErrorOptions {
  code?: string
  cause?: unknown
}

/** Business error with a machine-readable code, surfaced inside RPC error messages. */
export class ManagerError extends Error {
  readonly code: string
  constructor(message: string, options: ManagerErrorOptions = {}) {
    super(message, options.cause === undefined ? undefined : { cause: options.cause })
    this.name = 'ManagerError'
    this.code = options.code ?? 'internal'
  }
}

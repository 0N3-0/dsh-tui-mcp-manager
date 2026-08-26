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

/** A named collection of server identities; server configuration is never copied. */
export interface ManagedSetRecord {
  id: string
  name: string
  serverIds: string[]
}

export interface McpSetView extends ManagedSetRecord {
  active: boolean
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
  sets: McpSetView[]
  activeSetIds: string[]
}

export type McpDoctorState = 'pass' | 'warn' | 'fail'

export interface McpDoctorCheck {
  id: 'storage' | 'loader' | 'target' | 'cwd' | 'credentials' | 'runtime' | 'tools'
  state: McpDoctorState
  detail: string
  suggestion?: 'fix-permissions' | 'reload-profile' | 'edit-command' | 'edit-url' | 'edit-cwd' | 'set-credentials' | 'check-auth' | 'check-network' | 'reconnect-runtime' | 'wait-runtime'
}

/** Read-only diagnosis over the manager's existing Loader/MCP runtime. */
export interface McpDoctorReport {
  serverId: string
  state: McpDoctorState
  checkedAt: number
  checks: McpDoctorCheck[]
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

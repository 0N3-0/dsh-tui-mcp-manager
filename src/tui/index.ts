import { readFile, stat } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import type { CommandDefinition } from '@deepseek-ai/dsh-commands'
import { credentialRef, type CredentialInfo } from '@deepseek-ai/dsh-credentials'
import type { TuiDialogRuntime } from '@deepseek-harness-tui/dsh-tui/extensions'
import type { TuiPluginHost } from '@deepseek-harness-tui/dsh-tui/plugin-host'
import type { McpManagerService } from '../host/manager.js'
import type {
  ManagedServerRecord,
  McpManagerSnapshot,
  McpServerView,
  SecretHeaderRef,
} from '../host/types.js'

export const name = 'dsh-tui-mcp-manager-dialog'

type UiLang = 'zh' | 'en'

interface IconSet {
  states: Record<McpServerView['state'], string>
  add: string
  enable: string
  disable: string
  reconnect: string
  edit: string
  remove: string
  back: string
  field: string
  save: string
  cancel: string
  ok: string
}

type TuiDialogs = Pick<TuiDialogRuntime, 'input' | 'select' | 'confirm'>

interface CredentialProviderFace {
  describe(ref: ReturnType<typeof credentialRef>): Promise<CredentialInfo>
  set(ref: ReturnType<typeof credentialRef>, value: string): Promise<void>
}

interface ServerFormSubmission {
  record: ManagedServerRecord
  credentialValues: Record<string, string>
}

const DIALOG_TIMEOUT_MS = 10 * 60_000
const PLUGIN_LOADED_AT = Date.now()

// Match dsh-TUI's own figures: standard Unicode only, with no private-use,
// emoji, font probing, or alternate icon modes.
const ICONS: IconSet = {
  states: {
    connected: '\u2713',
    starting: '\u25b6',
    reconnecting: '\u21bb',
    failed: '\u2717',
    disabled: '\u25cb',
    stopped: '\u00d7',
  },
  add: '+',
  enable: '\u2713',
  disable: '\u25cb',
  reconnect: '\u21bb',
  edit: '\u2192',
  remove: '\u2717',
  back: '\u2190',
  field: '\u25c7',
  save: '\u2713',
  cancel: '\u00d7',
  ok: '\u2713',
}

function debug(message: string): void {
  if (process.env.DSH_TUI_DEBUG === '1') {
    process.stderr.write(`[dsh-tui-mcp-manager] ${message}\n`)
  }
}

const EN = {
  managerTitle: 'MCP Servers - {{profile}} | {{connected}}/{{servers}} ready | {{tools}} tools',
  add: 'Add server',
  refresh: 'Refresh',
  serverActions: '{{name}} {{tag}} | {{transport}} | {{tools}}',
  enable: 'Enable',
  disable: 'Disable',
  reconnect: 'Reconnect',
  edit: 'Edit',
  remove: 'Delete',
  back: 'Back',
  enabled: 'enabled',
  disabled: 'disabled',
  tools: '{{count}} tools',
  errorTitle: 'MCP Manager error',
  ok: 'OK',
  serverId: 'Add MCP server — ID',
  serverIdPlaceholder: 'lowercase letters, numbers, dot, underscore, or dash',
  displayName: '{{mode}} MCP server — display name',
  displayNamePlaceholder: 'optional; defaults to server name',
  serverName: '{{mode}} MCP server — server name',
  serverNamePlaceholder: 'name passed to dsh-mcp-client',
  transport: '{{mode}} MCP server — transport',
  command: '{{mode}} MCP server — command',
  commandPlaceholder: 'for example: npx',
  args: '{{mode}} MCP server — arguments',
  argsPlaceholder: 'space-separated; quote arguments that contain spaces',
  cwd: '{{mode}} MCP server — working directory',
  cwdPlaceholder: 'optional',
  env: '{{mode}} MCP server — environment variables',
  envPlaceholder: 'KEY=VALUE entries separated by comma or semicolon',
  url: '{{mode}} MCP server — URL',
  urlPlaceholder: 'https://example.com/mcp',
  headers: '{{mode}} MCP server — headers',
  headersPlaceholder: 'non-secret Header=value entries; do not paste API keys here',
  secretEnv: '{{mode}} MCP server — secret environment references',
  secretEnvPlaceholder: 'NAME=CREDENTIAL_REF entries separated by comma or semicolon',
  secretHeaders: '{{mode}} MCP server — secret header references',
  secretHeadersPlaceholder: 'Header=[PREFIX ]CREDENTIAL_REF; the reference name is your choice',
  credentialValue: '{{mode}} MCP server — credential value for {{ref}}',
  credentialValuePlaceholder: 'stored only in DSH credentials; input is visible in this TUI',
  credentialRequired: 'Credential {{ref}} is not configured. Enter a non-empty value.',
  credentialReadOnly: 'Credential {{ref}} is read-only in the active provider and cannot be updated here.',
  invalidId: 'ID must match [a-z0-9][a-z0-9._-]{0,63}.',
  invalidServerName: 'Server name must match [A-Za-z0-9_-]{1,32}.',
  invalidCommand: 'stdio transport requires a command.',
  invalidUrl: 'streamable-http transport requires a URL.',
  invalidPairs: 'Use NAME=VALUE entries separated by comma or semicolon.',
  invalidCredentialRefs: 'Use NAME=CREDENTIAL_REF; every reference must be a POSIX identifier.',
  invalidSecretHeaders: 'Use Header=[PREFIX ]CREDENTIAL_REF; do not paste the secret value into this field.',
  invalidSecretEnv: 'Secret-shaped environment variable names must use credential references, not plain environment values.',
  invalidPositiveNumber: 'Enter a positive finite number no greater than 2147483647.',
  invalidPositiveInteger: 'Enter a positive integer.',
  invalidReconnectDelays: 'Initial reconnect delay must be less than or equal to maximum reconnect delay.',
  escBack: 'Esc: previous field',
  escCancel: 'Esc: cancel form',
  escForm: 'Esc: return to form',
  enabledPrompt: '{{mode}} MCP server — initial state',
  addMode: 'Add',
  editMode: 'Edit',
  formTitle: '{{mode}} MCP server form - {{id}}',
  formId: 'ID',
  formDisplayName: 'Display name',
  formServerName: 'Server name',
  formTransport: 'Transport',
  formCommand: 'Command',
  formArgs: 'Arguments',
  formCwd: 'Working directory',
  formEnv: 'Environment variables',
  formSecretEnv: 'Secret environment references',
  formUrl: 'MCP endpoint URL',
  formHeaders: 'Request headers',
  formSecretHeaders: 'Secret header references',
  formToolTimeout: 'Tool-call timeout',
  formFailStartup: 'Fail on startup error',
  formEnabled: 'Enabled in this profile',
  formReconnect: 'Automatic reconnect',
  formInitialDelay: 'Initial reconnect delay',
  formMaxDelay: 'Maximum reconnect delay',
  formMaxAttempts: 'Maximum reconnect attempts',
  formCredential: 'Credential {{ref}}',
  formSave: 'Save and apply',
  formSaveDescription: 'Validate every field and write this server to cordis.patch.yml',
  formCancel: 'Cancel',
  formCancelDescription: 'Discard this form and return to the manager',
  valueEmpty: '(empty)',
  valueEntries: '{{count}} entries',
  valueArgs: '{{count}} arguments',
  valueMilliseconds: '{{value}} ms',
  valueConfigured: 'configured',
  valueMissing: 'not configured',
  valuePending: 'new value ready to save',
  confirmDelete: 'Delete MCP server?',
  confirmDeleteMessage: 'Remove “{{name}}” from cordis.patch.yml?',
  confirmDeleteButton: 'Delete',
  cancel: 'Cancel',
} as const

type CopyKey = keyof typeof EN

const ZH: Record<CopyKey, string> = {
  managerTitle: 'MCP 服务器 - {{profile}} | {{connected}}/{{servers}} 已连接 | {{tools}} 个工具',
  add: '添加服务器',
  refresh: '刷新',
  serverActions: '{{name}} {{tag}} | {{transport}} | {{tools}}',
  enable: '启用',
  disable: '停用',
  reconnect: '重新连接',
  edit: '编辑',
  remove: '删除',
  back: '返回',
  enabled: '已启用',
  disabled: '已停用',
  tools: '{{count}} 个工具',
  errorTitle: 'MCP 管理器错误',
  ok: '确定',
  serverId: '添加 MCP 服务器 — ID',
  serverIdPlaceholder: '小写字母、数字、点、下划线或短横线',
  displayName: '{{mode}} MCP 服务器 — 显示名称',
  displayNamePlaceholder: '可选，默认使用服务器名称',
  serverName: '{{mode}} MCP 服务器 — 服务器名称',
  serverNamePlaceholder: '传给 dsh-mcp-client 的名称',
  transport: '{{mode}} MCP 服务器 — 传输方式',
  command: '{{mode}} MCP 服务器 — 命令',
  commandPlaceholder: '例如：npx',
  args: '{{mode}} MCP 服务器 — 参数',
  argsPlaceholder: '空格分隔；包含空格的参数请加引号',
  cwd: '{{mode}} MCP 服务器 — 工作目录',
  cwdPlaceholder: '可选',
  env: '{{mode}} MCP 服务器 — 环境变量',
  envPlaceholder: 'KEY=VALUE，多项用逗号或分号分隔',
  url: '{{mode}} MCP 服务器 — URL',
  urlPlaceholder: 'https://example.com/mcp',
  headers: '{{mode}} MCP 服务器 — 请求头',
  headersPlaceholder: '非敏感 Header=value；不要在这里粘贴 API Key',
  secretEnv: '{{mode}} MCP 服务器 — 敏感环境变量引用',
  secretEnvPlaceholder: 'NAME=CREDENTIAL_REF，多项用逗号或分号分隔',
  secretHeaders: '{{mode}} MCP 服务器 — 敏感请求头引用',
  secretHeadersPlaceholder: 'Header=[前缀 ]CREDENTIAL_REF；引用名由你自行定义',
  credentialValue: '{{mode}} MCP 服务器 — 凭据 {{ref}} 的实际值',
  credentialValuePlaceholder: '只存入 DSH credentials；当前 TUI 输入时可见',
  credentialRequired: '凭据 {{ref}} 尚未配置，请输入非空值。',
  credentialReadOnly: '凭据 {{ref}} 在当前 provider 中只读，无法在这里更新。',
  invalidId: 'ID 必须匹配 [a-z0-9][a-z0-9._-]{0,63}。',
  invalidServerName: '服务器名称必须匹配 [A-Za-z0-9_-]{1,32}。',
  invalidCommand: 'stdio 传输方式必须填写命令。',
  invalidUrl: 'streamable-http 传输方式必须填写 URL。',
  invalidPairs: '请使用 NAME=VALUE，多项用逗号或分号分隔。',
  invalidCredentialRefs: '请使用 NAME=CREDENTIAL_REF；每个引用必须是 POSIX 标识符。',
  invalidSecretHeaders: '请使用 Header=[前缀 ]CREDENTIAL_REF；不要把真实密钥粘贴到这里。',
  invalidSecretEnv: '名称看起来像密钥的环境变量必须使用 credential reference，不能保存为普通环境变量。',
  invalidPositiveNumber: '请输入不大于 2147483647 的有限正数。',
  invalidPositiveInteger: '请输入正整数。',
  invalidReconnectDelays: '初始重连延迟不能大于最大重连延迟。',
  escBack: 'Esc：返回上一项',
  escCancel: 'Esc：取消表单',
  escForm: 'Esc：返回表单',
  enabledPrompt: '{{mode}} MCP 服务器 — 初始状态',
  addMode: '添加',
  editMode: '编辑',
  formTitle: '{{mode}} MCP 服务器表单 - {{id}}',
  formId: 'ID',
  formDisplayName: '显示名称',
  formServerName: '服务器名称',
  formTransport: '传输方式',
  formCommand: '命令',
  formArgs: '参数',
  formCwd: '工作目录',
  formEnv: '环境变量',
  formSecretEnv: '敏感环境变量引用',
  formUrl: 'MCP endpoint URL',
  formHeaders: '请求头',
  formSecretHeaders: '敏感请求头引用',
  formToolTimeout: '工具调用超时',
  formFailStartup: '启动错误时失败',
  formEnabled: '在此 profile 中启用',
  formReconnect: '自动重连',
  formInitialDelay: '初始重连延迟',
  formMaxDelay: '最大重连延迟',
  formMaxAttempts: '最大重连次数',
  formCredential: '凭据 {{ref}}',
  formSave: '保存并应用',
  formSaveDescription: '校验全部字段并将该服务器写入 cordis.patch.yml',
  formCancel: '取消',
  formCancelDescription: '放弃本表单并返回管理器',
  valueEmpty: '（空）',
  valueEntries: '{{count}} 项',
  valueArgs: '{{count}} 个参数',
  valueMilliseconds: '{{value}} 毫秒',
  valueConfigured: '已配置',
  valueMissing: '未配置',
  valuePending: '新值已准备保存',
  confirmDelete: '删除 MCP 服务器？',
  confirmDeleteMessage: '要从 cordis.patch.yml 中移除“{{name}}”吗？',
  confirmDeleteButton: '删除',
  cancel: '取消',
}

function copy(lang: UiLang, key: CopyKey, values: Record<string, string | number> = {}): string {
  const table = lang === 'zh' ? ZH : EN
  return Object.entries(values).reduce(
    (text, [name, value]) => text.replaceAll(`{{${name}}}`, String(value)),
    table[key] as string,
  )
}

function asLang(value: unknown): UiLang | undefined {
  return value === 'zh' || value === 'en' ? value : undefined
}

function iconLabel(icon: string, label: string): string {
  return `${icon} ${label}`
}

export async function resolveTuiLanguage(ctx: any): Promise<UiLang> {
  let persisted: UiLang | undefined
  let preferenceUpdatedAt = 0
  const preferencePath = join(homedir(), '.dsh-tui', 'lang.json')
  try {
    const [raw, metadata] = await Promise.all([
      readFile(preferencePath, 'utf8'),
      stat(preferencePath),
    ])
    persisted = asLang(JSON.parse(raw)?.lang)
    preferenceUpdatedAt = metadata.mtimeMs
  } catch {
    // Continue through dsh-TUI's normal startup precedence.
  }

  // /lang writes this file synchronously before repainting the host. A file
  // changed after this plugin loaded therefore represents the live language,
  // even while the best-effort settings mirror is still catching up.
  if (persisted && preferenceUpdatedAt >= PLUGIN_LOADED_AT) return persisted

  const fromEnvironment = asLang(process.env.DSH_TUI_LANG)
  if (fromEnvironment) return fromEnvironment

  try {
    const settings = ctx.get?.('settings')
    const namespace = settings
      ?.describe?.({ redactSecrets: true })
      ?.find?.((entry: { ns?: string }) => entry.ns === 'dsh-tui')
    const configured = asLang(namespace?.value?.lang)
    if (configured) return configured
  } catch {
    // Fall through to the same preference file used by dsh-TUI's /lang command.
  }

  if (persisted) return persisted

  const locale = process.env.LC_ALL || process.env.LC_MESSAGES || process.env.LANG || ''
  if (!locale) return 'zh'
  return locale.split('.')[0]?.toLowerCase().startsWith('zh') ? 'zh' : 'en'
}

export function applyTui(ctx: Context): void {
  ctx.inject(['tuiDialogs'], (tuiCtx: any) => {
    const dialogs = tuiCtx.get?.('tuiDialogs', false) as TuiDialogs | undefined
    const manager = tuiCtx.get?.('mcpManager', false) as McpManagerService | undefined
    const credentials = tuiCtx.get?.('credentials', false) as CredentialProviderFace | undefined
    if (!dialogs || !manager || !credentials) {
      debug(`inactive: dialogs=${Boolean(dialogs)} manager=${Boolean(manager)} credentials=${Boolean(credentials)}`)
      return
    }

    tuiCtx.effect(() => {
      const disposeTree = tuiCtx.get?.('tuiCommandTrees', false)?.register?.({
        root: 'mcp-manager',
        descriptions: {
          zh: '打开原生 MCP 服务器管理浮窗',
          en: 'Open the native MCP server manager dialog',
        },
        children: () => [],
      })
      const definition: CommandDefinition = {
        name: 'mcp-manager',
        description: 'Open the native MCP server manager dialog',
        handler: async () => {
          await runManager(tuiCtx, dialogs, manager, credentials, ICONS)
          return { kind: 'success' as const }
        },
      }
      const pluginHost = tuiCtx.get?.('tuiPluginHost', false) as TuiPluginHost | undefined
      const commands = tuiCtx.get?.('commands', false)
      let disposeCommand: (() => void) | undefined
      try {
        disposeCommand = pluginHost
          ? pluginHost.registerCommand(tuiCtx, 'dsh-tui.mcp-manager', definition)
          : commands?.register?.(definition)
        debug(`command registered through ${pluginHost ? 'tuiPluginHost' : 'commands fallback'}`)
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        const code = (error as { code?: unknown })?.code
        if (code === 'COMPONENT_NOT_ADMITTED' && commands?.register) {
          disposeCommand = commands.register(definition)
          debug('command registered through commands fallback: host did not admit this Loader activation')
        } else {
          disposeTree?.()
          debug(`command registration skipped: ${message}`)
          tuiCtx.logger?.warn?.(`dsh-tui-mcp-manager: command registration skipped: ${message}`)
          return
        }
      }
      if (!disposeCommand) {
        disposeTree?.()
        return
      }
      return () => {
        disposeCommand()
        disposeTree?.()
      }
    })
  })
}

async function runManager(
  ctx: any,
  dialogs: TuiDialogs,
  manager: McpManagerService,
  credentials: CredentialProviderFace,
  icons: IconSet,
): Promise<void> {
  while (true) {
    const lang = await resolveTuiLanguage(ctx)
    let snapshot: McpManagerSnapshot
    try {
      snapshot = await manager.invoke('list', {})
    } catch (error) {
      await showError(dialogs, lang, icons, error)
      return
    }

    const connected = snapshot.servers.filter((server) => server.state === 'connected').length
    const toolCount = snapshot.servers.reduce((total, server) => total + server.tools.length, 0)
    const choice = await dialogs.select({
      title: copy(lang, 'managerTitle', {
        profile: snapshot.profile.key,
        connected,
        servers: snapshot.servers.length,
        tools: toolCount,
      }),
      options: [
        ...serverListOptions(lang, snapshot.servers, icons),
        { id: 'add', label: iconLabel(icons.add, copy(lang, 'add')) },
        { id: 'refresh', label: iconLabel(icons.reconnect, copy(lang, 'refresh')) },
      ],
      timeoutMs: DIALOG_TIMEOUT_MS,
    })

    if (!choice) return

    if (choice === 'refresh') continue

    if (choice === 'add') {
      const input = await askForServer(dialogs, lang, snapshot, credentials, icons)
      if (!input) continue
      try {
        await persistCredentialValues(credentials, input.credentialValues)
        await manager.invoke('upsert', { server: input.record })
      } catch (error) {
        await showError(dialogs, lang, icons, error)
      }
      continue
    }

    if (choice.startsWith('server:')) {
      const serverId = choice.slice('server:'.length)
      await runServerActions(ctx, dialogs, manager, credentials, icons, serverId)
    }
  }
}

async function runServerActions(
  ctx: any,
  dialogs: TuiDialogs,
  manager: McpManagerService,
  credentials: CredentialProviderFace,
  icons: IconSet,
  serverId: string,
): Promise<boolean> {
  while (true) {
    const lang = await resolveTuiLanguage(ctx)
    let snapshot: McpManagerSnapshot
    try {
      snapshot = await manager.invoke('list', {})
    } catch (error) {
      await showError(dialogs, lang, icons, error)
      return false
    }
    const server = snapshot.servers.find((item) => item.id === serverId)
    if (!server) return false

    const choice = await dialogs.select({
      title: copy(lang, 'serverActions', {
        name: server.name,
        tag: stateTag(server.state, icons),
        transport: server.transport,
        tools: copy(lang, 'tools', { count: server.tools.length }),
      }),
      options: [
        {
          id: 'toggle',
          label: iconLabel(server.enabled ? icons.disable : icons.enable, copy(lang, server.enabled ? 'disable' : 'enable')),
        },
        ...(server.enabled
          ? [
              {
                id: 'reconnect',
                label: iconLabel(icons.reconnect, copy(lang, 'reconnect')),
              },
            ]
          : []),
        { id: 'edit', label: iconLabel(icons.edit, copy(lang, 'edit')) },
        { id: 'delete', label: iconLabel(icons.remove, copy(lang, 'remove')) },
        { id: 'back', label: iconLabel(icons.back, copy(lang, 'back')) },
      ],
      timeoutMs: DIALOG_TIMEOUT_MS,
    })

    if (!choice || choice === 'back') return false

    try {
      if (choice === 'toggle') {
        await manager.invoke('setEnabled', { id: serverId, enabled: !server.enabled })
        return true
      }
      if (choice === 'reconnect') {
        await manager.invoke('reconnect', { id: serverId })
        return true
      }
      if (choice === 'edit') {
        const input = await askForServer(dialogs, lang, snapshot, credentials, icons, server)
        if (input) {
          await persistCredentialValues(credentials, input.credentialValues)
          await manager.invoke('upsert', { server: input.record })
          return true
        }
        continue
      }
      if (choice === 'delete') {
        const confirmed = await dialogs.confirm({
          title: copy(lang, 'confirmDelete'),
          message: copy(lang, 'confirmDeleteMessage', { name: server.name }),
          confirmLabel: iconLabel(icons.remove, copy(lang, 'confirmDeleteButton')),
          cancelLabel: iconLabel(icons.cancel, copy(lang, 'cancel')),
          timeoutMs: DIALOG_TIMEOUT_MS,
        })
        if (confirmed) {
          await manager.invoke('remove', { id: serverId })
          return false
        }
      }
    } catch (error) {
      await showError(dialogs, lang, icons, error)
    }
  }
}

async function askForServer(
  dialogs: TuiDialogs,
  lang: UiLang,
  snapshot: McpManagerSnapshot,
  credentials: CredentialProviderFace,
  icons: IconSet,
  existing?: McpServerView,
): Promise<ServerFormSubmission | undefined> {
  const mode = copy(lang, existing ? 'editMode' : 'addMode')
  const draft = {
    id: existing?.id ?? nextServerId(snapshot),
    displayName: existing?.name ?? '',
    serverName: existing?.serverName ?? '',
    transport: existing?.transport ?? 'stdio' as ManagedServerRecord['transport'],
    command: existing?.command ?? '',
    args: formatArgs(existing?.args),
    cwd: existing?.cwd ?? '',
    env: formatEquals(existing?.env),
    secretEnv: formatEquals(Object.fromEntries(
      Object.entries(existing?.secretEnv ?? {}).map(([key, entry]) => [key, entry.ref]),
    )),
    url: existing?.url ?? '',
    headers: formatEquals(existing?.headers),
    secretHeaders: formatSecretHeaders(existing?.secretHeaders),
    enabled: existing?.enabled ?? true,
    toolCallTimeoutMs: existing?.toolCallTimeoutMs ?? 60_000,
    failOnStartupError: existing?.failOnStartupError ?? false,
    reconnect: {
      enabled: existing?.reconnect?.enabled ?? true,
      initialDelayMs: existing?.reconnect?.initialDelayMs ?? 500,
      maxDelayMs: existing?.reconnect?.maxDelayMs ?? 30_000,
      maxAttempts: existing?.reconnect?.maxAttempts ?? 10,
    },
    credentialValues: {} as Record<string, string>,
  }

  type StepResult = 'accepted' | 'retry' | 'back'
  interface WizardStep {
    key: string
    title: string
    run(title: string): Promise<StepResult>
  }

  const fail = async (key: CopyKey): Promise<false> => {
    await showError(dialogs, lang, icons, new Error(copy(lang, key)))
    return false
  }

  const inputStep = (
    key: string,
    title: string,
    placeholder: string,
    get: () => string,
    set: (value: string) => void,
    validate?: (value: string) => boolean | Promise<boolean>,
  ): WizardStep => ({
    key,
    title,
    async run(decoratedTitle) {
      const value = await ask(dialogs, decoratedTitle, placeholder, get())
      if (value === undefined) return 'back'
      if (validate && !(await validate(value))) return 'retry'
      set(value)
      return 'accepted'
    },
  })

  const booleanStep = (
    key: string,
    title: string,
    get: () => boolean,
    set: (value: boolean) => void,
  ): WizardStep => ({
    key,
    title,
    async run(decoratedTitle) {
      const current = get()
      const value = await dialogs.select({
        title: decoratedTitle,
        options: current
          ? [{ id: 'enabled', label: copy(lang, 'enabled') }, { id: 'disabled', label: copy(lang, 'disabled') }]
          : [{ id: 'disabled', label: copy(lang, 'disabled') }, { id: 'enabled', label: copy(lang, 'enabled') }],
        timeoutMs: DIALOG_TIMEOUT_MS,
      })
      if (!value) return 'back'
      set(value === 'enabled')
      return 'accepted'
    },
  })

  const positiveNumber = (value: string): number | undefined => {
    const parsed = Number(value)
    return Number.isFinite(parsed) && parsed >= 1 && parsed <= 2_147_483_647 ? parsed : undefined
  }

  const positiveInteger = (value: string): number | undefined => {
    const parsed = positiveNumber(value)
    return parsed !== undefined && Number.isInteger(parsed) ? parsed : undefined
  }

  const credentialReferences = (): string[] => {
    const refs = draft.transport === 'stdio'
      ? Object.values(parseCredentialRefs(draft.secretEnv))
      : Object.values(parseSecretHeaders(draft.secretHeaders)).map((entry) => entry.ref)
    return [...new Set(refs)]
  }

  const buildSteps = (): WizardStep[] => {
    const steps: WizardStep[] = []
    if (!existing) {
      steps.push(inputStep(
        'id',
        copy(lang, 'serverId'),
        copy(lang, 'serverIdPlaceholder'),
        () => draft.id,
        (value) => { draft.id = value },
        (value) => /^[a-z0-9][a-z0-9._-]{0,63}$/.test(value.trim()) || fail('invalidId'),
      ))
    }
    steps.push(
      inputStep(
        'displayName',
        copy(lang, 'displayName', { mode }),
        copy(lang, 'displayNamePlaceholder'),
        () => draft.displayName,
        (value) => { draft.displayName = value },
      ),
      inputStep(
        'serverName',
        copy(lang, 'serverName', { mode }),
        copy(lang, 'serverNamePlaceholder'),
        () => draft.serverName,
        (value) => { draft.serverName = value },
        (value) => /^[A-Za-z0-9_-]{1,32}$/.test(value.trim()) || fail('invalidServerName'),
      ),
      {
        key: 'transport',
        title: copy(lang, 'transport', { mode }),
        async run(title) {
          const choices: ManagedServerRecord['transport'][] = ['stdio', 'streamable-http']
          const value = await dialogs.select({
            title,
            options: [draft.transport, ...choices.filter((item) => item !== draft.transport)].map((item) => ({
              id: item,
              label: item,
            })),
            timeoutMs: DIALOG_TIMEOUT_MS,
          })
          if (!value) return 'back'
          draft.transport = value as ManagedServerRecord['transport']
          return 'accepted'
        },
      },
    )

    if (draft.transport === 'stdio') {
      steps.push(
        inputStep(
          'command',
          copy(lang, 'command', { mode }),
          copy(lang, 'commandPlaceholder'),
          () => draft.command,
          (value) => { draft.command = value },
          (value) => value.trim() !== '' || fail('invalidCommand'),
        ),
        inputStep('args', copy(lang, 'args', { mode }), copy(lang, 'argsPlaceholder'), () => draft.args, (value) => { draft.args = value }),
        inputStep('cwd', copy(lang, 'cwd', { mode }), copy(lang, 'cwdPlaceholder'), () => draft.cwd, (value) => { draft.cwd = value }),
        inputStep(
          'env',
          copy(lang, 'env', { mode }),
          copy(lang, 'envPlaceholder'),
          () => draft.env,
          (value) => { draft.env = value },
          async (value) => {
            if (!isPairMap(value)) return fail('invalidPairs')
            if (hasPlainSecretEnv(value)) return fail('invalidSecretEnv')
            return true
          },
        ),
        inputStep(
          'secretEnv',
          copy(lang, 'secretEnv', { mode }),
          copy(lang, 'secretEnvPlaceholder'),
          () => draft.secretEnv,
          (value) => { draft.secretEnv = value },
          (value) => isCredentialRefMap(value) || fail('invalidCredentialRefs'),
        ),
      )
    } else {
      steps.push(
        inputStep(
          'url',
          copy(lang, 'url', { mode }),
          copy(lang, 'urlPlaceholder'),
          () => draft.url,
          (value) => { draft.url = value },
          (value) => value.trim() !== '' || fail('invalidUrl'),
        ),
        inputStep(
          'headers',
          copy(lang, 'headers', { mode }),
          copy(lang, 'headersPlaceholder'),
          () => draft.headers,
          (value) => { draft.headers = value },
          async (value) => {
            if (!isPairMap(value)) return fail('invalidPairs')
            if (hasPlainSecretHeader(value)) return fail('invalidSecretHeaders')
            return true
          },
        ),
        inputStep(
          'secretHeaders',
          copy(lang, 'secretHeaders', { mode }),
          copy(lang, 'secretHeadersPlaceholder'),
          () => draft.secretHeaders,
          (value) => { draft.secretHeaders = value },
          (value) => isSecretHeaderMap(value) || fail('invalidSecretHeaders'),
        ),
      )
    }

    for (const ref of credentialReferences()) {
      steps.push({
        key: `credential:${ref}`,
        title: copy(lang, 'credentialValue', { mode, ref }),
        async run(title) {
          const info = await credentials.describe(credentialRef(ref))
          const value = await ask(dialogs, title, copy(lang, 'credentialValuePlaceholder'))
          if (value === undefined) return 'back'
          if (value === '') {
            if (info.configured || draft.credentialValues[ref] !== undefined) return 'accepted'
            await showError(dialogs, lang, icons, new Error(copy(lang, 'credentialRequired', { ref })))
            return 'retry'
          }
          if (!info.writable) {
            await showError(dialogs, lang, icons, new Error(copy(lang, 'credentialReadOnly', { ref })))
            return 'retry'
          }
          draft.credentialValues[ref] = value
          return 'accepted'
        },
      })
    }

    steps.push(
      inputStep(
        'toolCallTimeoutMs',
        copy(lang, 'formToolTimeout'),
        '60000',
        () => String(draft.toolCallTimeoutMs),
        (value) => { draft.toolCallTimeoutMs = Number(value) },
        (value) => positiveNumber(value) !== undefined || fail('invalidPositiveNumber'),
      ),
      booleanStep(
        'failOnStartupError',
        copy(lang, 'formFailStartup'),
        () => draft.failOnStartupError,
        (value) => { draft.failOnStartupError = value },
      ),
      booleanStep(
        'enabled',
        copy(lang, 'enabledPrompt', { mode }),
        () => draft.enabled,
        (value) => { draft.enabled = value },
      ),
      booleanStep(
        'reconnectEnabled',
        copy(lang, 'formReconnect'),
        () => draft.reconnect.enabled,
        (value) => { draft.reconnect.enabled = value },
      ),
      inputStep(
        'reconnectInitialDelayMs',
        copy(lang, 'formInitialDelay'),
        '500',
        () => String(draft.reconnect.initialDelayMs),
        (value) => { draft.reconnect.initialDelayMs = Number(value) },
        (value) => positiveNumber(value) !== undefined || fail('invalidPositiveNumber'),
      ),
      inputStep(
        'reconnectMaxDelayMs',
        copy(lang, 'formMaxDelay'),
        '30000',
        () => String(draft.reconnect.maxDelayMs),
        (value) => { draft.reconnect.maxDelayMs = Number(value) },
        (value) => positiveNumber(value) !== undefined || fail('invalidPositiveNumber'),
      ),
      inputStep(
        'reconnectMaxAttempts',
        copy(lang, 'formMaxAttempts'),
        '10',
        () => String(draft.reconnect.maxAttempts),
        (value) => { draft.reconnect.maxAttempts = Number(value) },
        (value) => positiveInteger(value) !== undefined || fail('invalidPositiveInteger'),
      ),
    )
    return steps
  }

  const labelFor = (key: string): string => {
    if (key.startsWith('credential:')) return copy(lang, 'formCredential', { ref: key.slice('credential:'.length) })
    const labels: Record<string, CopyKey> = {
      id: 'formId',
      displayName: 'formDisplayName',
      serverName: 'formServerName',
      transport: 'formTransport',
      command: 'formCommand',
      args: 'formArgs',
      cwd: 'formCwd',
      env: 'formEnv',
      secretEnv: 'formSecretEnv',
      url: 'formUrl',
      headers: 'formHeaders',
      secretHeaders: 'formSecretHeaders',
      toolCallTimeoutMs: 'formToolTimeout',
      failOnStartupError: 'formFailStartup',
      enabled: 'formEnabled',
      reconnectEnabled: 'formReconnect',
      reconnectInitialDelayMs: 'formInitialDelay',
      reconnectMaxDelayMs: 'formMaxDelay',
      reconnectMaxAttempts: 'formMaxAttempts',
    }
    return copy(lang, labels[key] ?? 'formServerName')
  }

  const present = (value: string): string => value.trim() === '' ? copy(lang, 'valueEmpty') : value
  const count = (value: string, key: 'valueEntries' | 'valueArgs'): string => copy(lang, key, {
    count: key === 'valueArgs' ? parseArgs(value).length : (parseAssignments(value) ?? []).length,
  })

  const summaryFor = async (key: string): Promise<string> => {
    if (key.startsWith('credential:')) {
      const ref = key.slice('credential:'.length)
      if (draft.credentialValues[ref] !== undefined) return copy(lang, 'valuePending')
      try {
        return (await credentials.describe(credentialRef(ref))).configured
          ? copy(lang, 'valueConfigured')
          : copy(lang, 'valueMissing')
      } catch {
        return copy(lang, 'valueMissing')
      }
    }
    switch (key) {
      case 'id': return draft.id
      case 'displayName': return present(draft.displayName)
      case 'serverName': return present(draft.serverName)
      case 'transport': return draft.transport
      case 'command': return present(draft.command)
      case 'args': return count(draft.args, 'valueArgs')
      case 'cwd': return present(draft.cwd)
      case 'env': return count(draft.env, 'valueEntries')
      case 'secretEnv': return count(draft.secretEnv, 'valueEntries')
      case 'url': return present(draft.url)
      case 'headers': return count(draft.headers, 'valueEntries')
      case 'secretHeaders': return count(draft.secretHeaders, 'valueEntries')
      case 'toolCallTimeoutMs': return copy(lang, 'valueMilliseconds', { value: draft.toolCallTimeoutMs })
      case 'failOnStartupError': return copy(lang, draft.failOnStartupError ? 'enabled' : 'disabled')
      case 'enabled': return copy(lang, draft.enabled ? 'enabled' : 'disabled')
      case 'reconnectEnabled': return copy(lang, draft.reconnect.enabled ? 'enabled' : 'disabled')
      case 'reconnectInitialDelayMs': return copy(lang, 'valueMilliseconds', { value: draft.reconnect.initialDelayMs })
      case 'reconnectMaxDelayMs': return copy(lang, 'valueMilliseconds', { value: draft.reconnect.maxDelayMs })
      case 'reconnectMaxAttempts': return String(draft.reconnect.maxAttempts)
      default: return copy(lang, 'valueEmpty')
    }
  }

  const validateForm = async (): Promise<boolean> => {
    if (!/^[a-z0-9][a-z0-9._-]{0,63}$/.test(draft.id.trim())) return fail('invalidId')
    if (!/^[A-Za-z0-9_-]{1,32}$/.test(draft.serverName.trim())) return fail('invalidServerName')
    if (draft.transport === 'stdio' && draft.command.trim() === '') return fail('invalidCommand')
    if (draft.transport === 'streamable-http' && draft.url.trim() === '') return fail('invalidUrl')
    if (draft.transport === 'stdio') {
      if (!isPairMap(draft.env)) return fail('invalidPairs')
      if (hasPlainSecretEnv(draft.env)) return fail('invalidSecretEnv')
      if (!isCredentialRefMap(draft.secretEnv)) return fail('invalidCredentialRefs')
    } else {
      if (!isPairMap(draft.headers)) return fail('invalidPairs')
      if (hasPlainSecretHeader(draft.headers)) return fail('invalidSecretHeaders')
      if (!isSecretHeaderMap(draft.secretHeaders)) return fail('invalidSecretHeaders')
    }
    if (positiveNumber(String(draft.toolCallTimeoutMs)) === undefined) return fail('invalidPositiveNumber')
    if (positiveNumber(String(draft.reconnect.initialDelayMs)) === undefined) return fail('invalidPositiveNumber')
    if (positiveNumber(String(draft.reconnect.maxDelayMs)) === undefined) return fail('invalidPositiveNumber')
    if (positiveInteger(String(draft.reconnect.maxAttempts)) === undefined) return fail('invalidPositiveInteger')
    if (draft.reconnect.initialDelayMs > draft.reconnect.maxDelayMs) return fail('invalidReconnectDelays')
    for (const ref of credentialReferences()) {
      const info = await credentials.describe(credentialRef(ref)).catch(() => ({ configured: false, writable: false }))
      if (!info.configured && draft.credentialValues[ref] === undefined) {
        await showError(dialogs, lang, icons, new Error(copy(lang, 'credentialRequired', { ref })))
        return false
      }
    }
    return true
  }

  while (true) {
    const steps = buildSteps()
    const fields = await Promise.all(steps.map(async (step) => ({
      step,
      name: truncateToCells(labelFor(step.key), 28),
      value: truncateToCells(await summaryFor(step.key), 42),
    })))
    const fieldNameWidth = Math.max(0, ...fields.map((field) => terminalCellWidth(field.name)))
    const fieldOptions = fields.map(({ step, name, value }) => ({
      id: `field:${step.key}`,
      label: [
        icons.field,
        padToCells(name, fieldNameWidth),
        value,
      ].join(PAD_CELL.repeat(2)),
    }))
    const choice = await dialogs.select({
      title: copy(lang, 'formTitle', { mode, id: draft.id }),
      options: [
        ...fieldOptions,
        { id: 'save', label: iconLabel(icons.save, copy(lang, 'formSave')) },
        { id: 'cancel', label: iconLabel(icons.cancel, copy(lang, 'formCancel')) },
      ],
      timeoutMs: DIALOG_TIMEOUT_MS,
    })
    if (!choice || choice === 'cancel') return undefined

    if (choice !== 'save') {
      const step = steps.find((item) => `field:${item.key}` === choice)
      if (!step) continue
      let outcome: StepResult
      do {
        outcome = await step.run(`${step.title} — ${copy(lang, 'escForm')}`)
      } while (outcome === 'retry')
      continue
    }

    if (!(await validateForm())) continue

    const common: Omit<ManagedServerRecord, 'transport'> = {
      id: draft.id.trim(),
      name: draft.displayName.trim() || draft.serverName.trim(),
      serverName: draft.serverName.trim(),
      enabled: draft.enabled,
      toolCallTimeoutMs: draft.toolCallTimeoutMs,
      failOnStartupError: draft.failOnStartupError,
      reconnect: { ...draft.reconnect },
    }
    const record: ManagedServerRecord = draft.transport === 'stdio'
      ? {
          ...common,
          transport: 'stdio',
          command: draft.command.trim(),
          args: parseArgs(draft.args),
          cwd: draft.cwd.trim(),
          env: parsePairs(draft.env),
          secretEnv: parseCredentialRefs(draft.secretEnv),
        }
      : {
          ...common,
          transport: 'streamable-http',
          url: draft.url.trim(),
          headers: parsePairs(draft.headers),
          secretHeaders: parseSecretHeaders(draft.secretHeaders),
        }
    const activeRefs = new Set(credentialReferences())
    return {
      record,
      credentialValues: Object.fromEntries(
        Object.entries(draft.credentialValues).filter(([ref]) => activeRefs.has(ref)),
      ),
    }
  }
}

async function persistCredentialValues(
  credentials: CredentialProviderFace,
  values: Record<string, string>,
): Promise<void> {
  for (const [ref, value] of Object.entries(values)) {
    await credentials.set(credentialRef(ref), value)
  }
}

async function ask(
  dialogs: TuiDialogs,
  title: string,
  placeholder: string,
  initial = '',
): Promise<string | undefined> {
  return dialogs.input({ title, placeholder, initial, timeoutMs: DIALOG_TIMEOUT_MS })
}

async function showError(dialogs: TuiDialogs, lang: UiLang, icons: IconSet, error: unknown): Promise<void> {
  await dialogs.select({
    title: copy(lang, 'errorTitle'),
    options: [
      {
        id: 'ok',
        label: iconLabel(icons.ok, copy(lang, 'ok')),
        description: error instanceof Error ? error.message : String(error),
      },
    ],
    timeoutMs: DIALOG_TIMEOUT_MS,
  })
}

function serverListOptions(lang: UiLang, servers: readonly McpServerView[], icons: IconSet) {
  const names = servers.map((server) => truncateToCells(server.name, 24))
  const toolCounts = servers.map((server) =>
    server.tools.length === 0 && (server.state === 'starting' || server.state === 'reconnecting')
      ? '...'
      : String(server.tools.length),
  )
  const nameWidth = Math.max(0, ...names.map(terminalCellWidth))
  const tagWidth = Math.max(0, ...servers.map((server) => terminalCellWidth(stateTag(server.state, icons))))
  const toolCountWidth = Math.max(1, ...toolCounts.map(terminalCellWidth))

  return servers.map((server, index) => ({
    id: `server:${server.id}`,
    label: [
      padToCells(names[index] ?? server.name, nameWidth),
      padToCells(stateTag(server.state, icons), tagWidth),
      copy(lang, 'tools', { count: (toolCounts[index] ?? '0').padStart(toolCountWidth, PAD_CELL) }),
    ].join(PAD_CELL.repeat(2)),
  }))
}

function stateTag(state: McpServerView['state'], icons: IconSet): string {
  return icons.states[state]
}

// The managed-dialog sanitizer collapses every Unicode whitespace run. U+2800
// is a single-cell blank glyph rather than whitespace, so table padding
// survives the public dialog boundary and keeps terminal columns aligned.
const PAD_CELL = '\u2800'

function terminalCellWidth(text: string): number {
  let width = 0
  for (const character of text) width += characterCellWidth(character)
  return width
}

function padToCells(text: string, width: number): string {
  return text + PAD_CELL.repeat(Math.max(0, width - terminalCellWidth(text)))
}

function truncateToCells(text: string, maxWidth: number): string {
  if (terminalCellWidth(text) <= maxWidth) return text
  const suffix = '...'
  const contentWidth = Math.max(0, maxWidth - suffix.length)
  let result = ''
  let width = 0
  for (const character of text) {
    const nextWidth = characterCellWidth(character)
    if (width + nextWidth > contentWidth) break
    result += character
    width += nextWidth
  }
  return result + suffix
}

function characterCellWidth(character: string): number {
  const codePoint = character.codePointAt(0) ?? 0
  if (
    codePoint === 0
    || codePoint < 0x20
    || (codePoint >= 0x7f && codePoint < 0xa0)
    || codePoint === 0x200d
    || (codePoint >= 0xfe00 && codePoint <= 0xfe0f)
    || /\p{Mark}/u.test(character)
  ) return 0
  if (/\p{Extended_Pictographic}/u.test(character) || isWideCodePoint(codePoint)) return 2
  return 1
}

function isWideCodePoint(codePoint: number): boolean {
  return codePoint >= 0x1100 && (
    codePoint <= 0x115f
    || codePoint === 0x2329
    || codePoint === 0x232a
    || (codePoint >= 0x2e80 && codePoint <= 0x303e)
    || (codePoint >= 0x3040 && codePoint <= 0xa4cf && codePoint !== 0x303f)
    || (codePoint >= 0xac00 && codePoint <= 0xd7a3)
    || (codePoint >= 0xf900 && codePoint <= 0xfaff)
    || (codePoint >= 0xfe10 && codePoint <= 0xfe19)
    || (codePoint >= 0xfe30 && codePoint <= 0xfe6f)
    || (codePoint >= 0xff00 && codePoint <= 0xff60)
    || (codePoint >= 0xffe0 && codePoint <= 0xffe6)
    || (codePoint >= 0x1b000 && codePoint <= 0x1b2ff)
    || (codePoint >= 0x1f200 && codePoint <= 0x1f251)
    || (codePoint >= 0x20000 && codePoint <= 0x3fffd)
  )
}

function nextServerId(snapshot: McpManagerSnapshot): string {
  const existing = new Set(snapshot.servers.map((server) => server.id))
  let index = 1
  while (existing.has(`mcp-${index}`)) index += 1
  return `mcp-${index}`
}

const CREDENTIAL_REF = /^[A-Za-z_][A-Za-z0-9_]*$/
const PLAIN_SECRET_HEADER = /^(authorization|proxy-authorization|cookie|api-key|x-api-key|x-auth-token)$/i
const PLAIN_SECRET_ENV = /(?:^|_)(TOKEN|SECRET|PASSWORD|PASSWD|API_?KEY|AUTH)(?:$|_)|^AUTH/i

function parseAssignments(value: string): Array<[string, string]> | undefined {
  const result: Array<[string, string]> = []
  for (const raw of value.split(/[\n,;]+/)) {
    const part = raw.trim()
    if (part === '') continue
    const index = part.indexOf('=')
    if (index <= 0) return undefined
    const name = part.slice(0, index).trim()
    const item = part.slice(index + 1).trim()
    if (name === '' || item === '') return undefined
    result.push([name, item])
  }
  return result
}

function isPairMap(value: string): boolean {
  return value.trim() === '' || parseAssignments(value) !== undefined
}

function parsePairs(value: string): Record<string, string> {
  return Object.fromEntries(parseAssignments(value) ?? [])
}

function hasPlainSecretHeader(value: string): boolean {
  return (parseAssignments(value) ?? []).some(([name]) => PLAIN_SECRET_HEADER.test(name))
}

function hasPlainSecretEnv(value: string): boolean {
  return (parseAssignments(value) ?? []).some(([name]) => PLAIN_SECRET_ENV.test(name))
}

function isCredentialRefMap(value: string): boolean {
  const entries = parseAssignments(value)
  return entries !== undefined && entries.every(([, ref]) => CREDENTIAL_REF.test(ref))
}

function parseCredentialRefs(value: string): Record<string, string> {
  return Object.fromEntries(parseAssignments(value) ?? [])
}

function formatEquals(value?: Record<string, string>): string {
  return Object.entries(value ?? {})
    .map(([key, item]) => `${key}=${item}`)
    .join(', ')
}

/**
 * Parse one compact, shell-like secret-header entry:
 *
 *   Authorization=Bearer AUTH_TOKEN_REF
 *   X-API-Key=SERVICE_API_KEY
 *
 * The final token is always a credential reference. Everything before it,
 * including the separating whitespace, is the literal prefix. Requiring a
 * whitespace boundary for prefixed values keeps a pasted API key from being
 * split into a seemingly valid reference plus a persisted secret prefix.
 */
function parseSecretHeaderSpec(spec: string): SecretHeaderRef | undefined {
  if (CREDENTIAL_REF.test(spec)) return { ref: spec }
  const prefixed = spec.match(/^(.+\s)([A-Za-z_][A-Za-z0-9_]*)$/s)
  return prefixed ? { ref: prefixed[2], prefix: prefixed[1] } : undefined
}

function isSecretHeaderMap(value: string): boolean {
  const entries = parseAssignments(value)
  return entries !== undefined && entries.every(([, spec]) => parseSecretHeaderSpec(spec) !== undefined)
}

function parseSecretHeaders(value: string): Record<string, SecretHeaderRef> {
  return Object.fromEntries(
    (parseAssignments(value) ?? []).map(([name, spec]) => [name, parseSecretHeaderSpec(spec)!]),
  )
}

function formatSecretHeaders(value?: Record<string, SecretHeaderRef>): string {
  return Object.entries(value ?? {})
    .map(([key, entry]) => `${key}=${entry.prefix ?? ''}${entry.ref}`)
    .join(', ')
}

function parseArgs(value: string): string[] {
  const result: string[] = []
  let current = ''
  let quote: '"' | "'" | undefined
  let escaped = false
  let started = false
  for (const character of value) {
    if (escaped) {
      current += character
      escaped = false
      started = true
    } else if (character === '\\' && quote !== "'") {
      escaped = true
      started = true
    } else if (quote) {
      if (character === quote) quote = undefined
      else current += character
    } else if (character === '"' || character === "'") {
      quote = character
      started = true
    } else if (/\s/.test(character)) {
      if (started) result.push(current)
      current = ''
      started = false
    } else {
      current += character
      started = true
    }
  }
  if (escaped) current += '\\'
  if (started) result.push(current)
  return result
}

function formatArgs(value?: string[]): string {
  return (value ?? [])
    .map((item) => (item === '' || /[\s"'\\]/.test(item) ? JSON.stringify(item) : item))
    .join(' ')
}

export type { McpManagerService }

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
  ManagedSetRecord,
  ManagedServerRecord,
  McpDoctorCheck,
  McpManagerSnapshot,
  McpServerView,
  McpSetView,
  McpToolView,
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
  managerTitle: 'MCP Servers - {{profile}} | {{connected}}/{{servers}} ready | {{tools}} tools | set: {{set}}',
  refresh: 'Refresh',
  serverActions: '{{name}} {{tag}} | {{transport}} | {{tools}}',
  enable: 'Enable',
  disable: 'Disable',
  reconnect: 'Reconnect',
  inspect: 'Inspect',
  doctor: 'Doctor',
  duplicate: 'Duplicate',
  sets: 'MCP Sets',
  noActiveSet: 'Default',
  createSet: 'Create set',
  setActions: '{{name}} | {{count}} servers',
  activateSet: 'Enable this set',
  deactivateSet: 'Disable this set',
  editSet: 'Edit set',
  addServerToSet: 'Add server',
  addNewServer: 'Add a new MCP server',
  setServerPoolTitle: '{{name}} - server pool',
  addExistingToSet: 'Add to this set',
  removeExistingFromSet: 'Remove from this set',
  collapseSet: 'Collapse members',
  expandSet: 'Expand members',
  deleteSet: 'Delete set',
  setFormTitle: '{{mode}} MCP set - {{id}}',
  setId: 'ID',
  setName: 'Display name',
  setMembers: 'Server members',
  setAddMember: 'Add server member',
  setColumnName: 'name',
  setColumnId: 'ID',
  setColumnNamespace: 'namespace',
  setColumnTransport: 'transport',
  setColumnState: 'state',
  setColumnTools: 'tools',
  setSave: 'Save set',
  setCancel: 'Cancel',
  setCreateMode: 'Create',
  setEditMode: 'Edit',
  setIdPrompt: 'Create MCP set - ID',
  setIdPlaceholder: 'lowercase letters, numbers, dot, underscore, or dash',
  setNamePrompt: '{{mode}} MCP set - display name',
  setNamePlaceholder: 'for example: Research',
  invalidSetId: 'Set ID must match [a-z0-9][a-z0-9._-]{0,63}.',
  invalidSetName: 'Set display name must contain 1 to 80 characters.',
  confirmDeleteSet: 'Delete MCP set?',
  confirmDeleteSetMessage: 'Delete “{{name}}”? Server configurations are not changed.',
  doctorTitle: '{{name}} | Doctor {{state}}',
  doctorStorage: 'Profile storage',
  doctorLoader: 'Loader row',
  doctorTarget: 'Connection target',
  doctorCwd: 'Working directory',
  doctorCredentials: 'Credential references',
  doctorRuntime: 'Existing runtime',
  doctorTools: 'Tool registry',
  runAgain: 'Run checks again',
  reconnectAndCheck: 'Reconnect and check again',
  suggestFixPermissions: 'Fix profile file permissions, then refresh.',
  suggestReloadProfile: 'Refresh first; if it remains unapplied, inspect cordis.patch.yml or restart this profile.',
  suggestEditCommand: 'Edit the command or use an executable absolute path.',
  suggestEditUrl: 'Edit the endpoint and use an http:// or https:// URL.',
  suggestEditCwd: 'Edit the working directory or leave it empty.',
  suggestSetCredentials: 'Edit this server and configure each missing credential value.',
  suggestCheckAuth: 'Check the credential reference, header name and required prefix.',
  suggestCheckNetwork: 'Check endpoint reachability, DNS, proxy and timeout settings.',
  suggestReconnectRuntime: 'Reconnect this server; if it still fails, inspect the host terminal output.',
  suggestWaitRuntime: 'Wait for startup to settle, then run checks again; reconnect if it does not.',
  overview: 'Overview',
  toolList: 'Tools and schema',
  latestError: 'Latest error',
  noError: 'No runtime error',
  noTools: 'This server currently exposes no tools.',
  toolTitle: '{{name}} | {{count}} parameters',
  required: 'required',
  optional: 'optional',
  schema: 'Schema',
  description: 'Description',
  configTransport: 'Transport',
  configTarget: 'Target',
  configState: 'Runtime state',
  configUpdated: 'Last update',
  configCredentials: 'Credentials',
  configReconnect: 'Auto reconnect',
  configTimeout: 'Tool timeout',
  edit: 'Edit',
  remove: 'Delete',
  back: 'Back',
  enabled: 'enabled',
  disabled: 'disabled',
  tools: '{{count}} tools',
  errorTitle: 'MCP Manager error',
  ok: 'OK',
  serverId: '{{mode}} MCP server — ID',
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
  escForm: 'Esc: return to form',
  addMode: 'Add',
  editMode: 'Edit',
  duplicateMode: 'Duplicate',
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
  formReconnect: 'Automatic reconnect',
  formInitialDelay: 'Initial reconnect delay',
  formMaxDelay: 'Maximum reconnect delay',
  formMaxAttempts: 'Maximum reconnect attempts',
  formCredential: 'Credential {{ref}}',
  formSave: 'Save and apply',
  formCancel: 'Cancel',
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
  managerTitle: 'MCP 服务器 - {{profile}} | {{connected}}/{{servers}} 已连接 | {{tools}} 个工具 | 集合：{{set}}',
  refresh: '刷新',
  serverActions: '{{name}} {{tag}} | {{transport}} | {{tools}}',
  enable: '启用',
  disable: '停用',
  reconnect: '重新连接',
  inspect: '检查详情',
  doctor: '诊断',
  duplicate: '复制',
  sets: 'MCP 集合',
  noActiveSet: '默认',
  createSet: '创建集合',
  setActions: '{{name}} | {{count}} 个服务器',
  activateSet: '启用此集合',
  deactivateSet: '停用此集合',
  editSet: '编辑集合',
  addServerToSet: '添加服务器',
  addNewServer: '添加全新的 MCP 服务器',
  setServerPoolTitle: '{{name}} - 服务器池',
  addExistingToSet: '加入当前集合',
  removeExistingFromSet: '移出当前集合',
  collapseSet: '折叠成员',
  expandSet: '展开成员',
  deleteSet: '删除集合',
  setFormTitle: '{{mode}} MCP 集合 - {{id}}',
  setId: 'ID',
  setName: '显示名称',
  setMembers: '服务器成员',
  setAddMember: '添加服务器成员',
  setColumnName: '名称',
  setColumnId: 'ID',
  setColumnNamespace: '命名空间',
  setColumnTransport: '传输',
  setColumnState: '状态',
  setColumnTools: '工具',
  setSave: '保存集合',
  setCancel: '取消',
  setCreateMode: '创建',
  setEditMode: '编辑',
  setIdPrompt: '创建 MCP 集合 - ID',
  setIdPlaceholder: '小写字母、数字、点、下划线或短横线',
  setNamePrompt: '{{mode}} MCP 集合 - 显示名称',
  setNamePlaceholder: '例如：研究',
  invalidSetId: '集合 ID 必须匹配 [a-z0-9][a-z0-9._-]{0,63}。',
  invalidSetName: '集合显示名称必须包含 1 到 80 个字符。',
  confirmDeleteSet: '删除 MCP 集合？',
  confirmDeleteSetMessage: '要删除“{{name}}”吗？服务器配置不会改变。',
  doctorTitle: '{{name}} | 诊断 {{state}}',
  doctorStorage: 'Profile 存储',
  doctorLoader: 'Loader 配置行',
  doctorTarget: '连接目标',
  doctorCwd: '工作目录',
  doctorCredentials: '凭据引用',
  doctorRuntime: '现有运行时',
  doctorTools: '工具注册表',
  runAgain: '重新检查',
  reconnectAndCheck: '重连并重新检查',
  suggestFixPermissions: '修复 profile 文件权限后刷新。',
  suggestReloadProfile: '先刷新；如果仍未应用，请检查 cordis.patch.yml 或重启当前 profile。',
  suggestEditCommand: '编辑命令，或改用可执行文件的绝对路径。',
  suggestEditUrl: '编辑 endpoint，并使用 http:// 或 https:// URL。',
  suggestEditCwd: '编辑工作目录，或将其留空。',
  suggestSetCredentials: '编辑服务器，为每个缺失的凭据引用填写实际值。',
  suggestCheckAuth: '检查凭据引用、请求头名称以及服务要求的前缀。',
  suggestCheckNetwork: '检查 endpoint 连通性、DNS、代理和超时配置。',
  suggestReconnectRuntime: '重新连接此服务器；如果仍然失败，请查看宿主终端输出。',
  suggestWaitRuntime: '等待启动完成后重新检查；长时间无变化时执行重连。',
  overview: '概览',
  toolList: '工具与 Schema',
  latestError: '最近错误',
  noError: '当前没有运行时错误',
  noTools: '此服务器当前没有暴露工具。',
  toolTitle: '{{name}} | {{count}} 个参数',
  required: '必填',
  optional: '可选',
  schema: 'Schema',
  description: '说明',
  configTransport: '传输方式',
  configTarget: '连接目标',
  configState: '运行状态',
  configUpdated: '最后更新',
  configCredentials: '凭据',
  configReconnect: '自动重连',
  configTimeout: '工具超时',
  edit: '编辑',
  remove: '删除',
  back: '返回',
  enabled: '已启用',
  disabled: '已停用',
  tools: '{{count}} 个工具',
  errorTitle: 'MCP 管理器错误',
  ok: '确定',
  serverId: '{{mode}} MCP 服务器 — ID',
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
  escForm: 'Esc：返回表单',
  addMode: '添加',
  editMode: '编辑',
  duplicateMode: '复制',
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
  formReconnect: '自动重连',
  formInitialDelay: '初始重连延迟',
  formMaxDelay: '最大重连延迟',
  formMaxAttempts: '最大重连次数',
  formCredential: '凭据 {{ref}}',
  formSave: '保存并应用',
  formCancel: '取消',
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
  const collapsedSetIds = new Set<string>()
  let setsCollapsed = false
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
    const activeSetNames = snapshot.sets.filter((set) => set.active).map((set) => setDisplayName(lang, set))
    const activeSetName = activeSetNames.join(', ') || '-'
    const treeOptions = snapshot.sets.flatMap((set) => {
      const collapsed = collapsedSetIds.has(set.id)
      const members = set.serverIds
        .map((id) => snapshot.servers.find((server) => server.id === id))
        .filter((server): server is McpServerView => server !== undefined)
      return [
        {
          id: `set:${set.id}`,
          label: `├─${PAD_CELL}${collapsed ? '▸' : '▾'}${PAD_CELL}${set.active ? icons.enable : icons.disable}${PAD_CELL}${setDisplayName(lang, set)}${PAD_CELL.repeat(2)}${members.length}`,
        },
        ...(collapsed ? [] : [
          ...serverListOptions(lang, members, icons, `│${PAD_CELL.repeat(2)}`, `set-server:${set.id}:`, snapshot.servers, true),
          {
            id: `add-to-set:${set.id}`,
            label: `│${PAD_CELL.repeat(2)}└─${PAD_CELL}${iconLabel(icons.add, copy(lang, 'addServerToSet'))}`,
          },
        ]),
      ]
    })
    const choice = await dialogs.select({
      title: copy(lang, 'managerTitle', {
        profile: snapshot.profile.key,
        connected,
        servers: snapshot.servers.length,
        tools: toolCount,
        set: activeSetName,
      }),
      options: [
        { id: 'refresh', label: iconLabel(icons.reconnect, copy(lang, 'refresh')) },
        { id: 'sets', label: `${setsCollapsed ? '▸' : '▾'}${PAD_CELL}${copy(lang, 'sets')}${PAD_CELL.repeat(2)}${snapshot.sets.length}` },
        ...(setsCollapsed ? [] : [
          ...treeOptions,
          { id: 'create-set', label: `└─${PAD_CELL}${iconLabel(icons.add, copy(lang, 'createSet'))}` },
        ]),
      ],
      timeoutMs: DIALOG_TIMEOUT_MS,
    })

    if (!choice) return

    if (choice === 'refresh') continue

    if (choice === 'sets') {
      setsCollapsed = !setsCollapsed
      continue
    }

    if (choice === 'create-set') {
      const set = await askForSet(dialogs, lang, snapshot, manager, credentials, icons)
      if (set) {
        try {
          await manager.invoke('upsertSet', { set })
        } catch (error) {
          await showError(dialogs, lang, icons, error)
        }
      }
      continue
    }

    if (choice.startsWith('set:')) {
      const setId = choice.slice(4)
      if (await runSetActions(ctx, dialogs, manager, credentials, icons, setId, collapsedSetIds.has(setId))) {
        if (collapsedSetIds.has(setId)) collapsedSetIds.delete(setId)
        else collapsedSetIds.add(setId)
      }
      continue
    }

    if (choice.startsWith('add-to-set:')) {
      await runServerPoolForSet(ctx, dialogs, manager, credentials, icons, choice.slice('add-to-set:'.length))
      continue
    }

    if (choice.startsWith('set-server:')) {
      const [setId, serverId] = choice.slice('set-server:'.length).split(':')
      if (setId && serverId) await runServerActions(ctx, dialogs, manager, credentials, icons, setId, serverId)
    }
  }
}

async function runServerPoolForSet(
  ctx: any,
  dialogs: TuiDialogs,
  manager: McpManagerService,
  credentials: CredentialProviderFace,
  icons: IconSet,
  setId: string,
): Promise<void> {
  const lang = await resolveTuiLanguage(ctx)
  const snapshot = await manager.invoke('list', {})
  const set = snapshot.sets.find((candidate) => candidate.id === setId)
  if (!set) return
  const result = await runDraftServerPool(
    dialogs,
    lang,
    manager,
    credentials,
    icons,
    snapshot,
    setDisplayName(lang, set),
    set.serverIds,
  )
  if (result.serverIds.join('\0') !== set.serverIds.join('\0')) {
    try {
      await manager.invoke('upsertSet', { set: { id: set.id, name: set.name, serverIds: result.serverIds } })
    } catch (error) {
      await showError(dialogs, lang, icons, error)
    }
  }
}

async function runDraftServerPool(
  dialogs: TuiDialogs,
  lang: UiLang,
  manager: McpManagerService,
  credentials: CredentialProviderFace,
  icons: IconSet,
  initialSnapshot: McpManagerSnapshot,
  setName: string,
  initialServerIds: readonly string[],
): Promise<{ snapshot: McpManagerSnapshot; serverIds: string[] }> {
  let snapshot = initialSnapshot
  const serverIds = new Set(initialServerIds)
  while (true) {
    const members = new Set(serverIds)
    const names = snapshot.servers.map((server) => truncateToCells(server.name, 18))
    const ids = snapshot.servers.map((server) => truncateToCells(server.id, 18))
    const namespaces = snapshot.servers.map((server) => truncateToCells(server.serverName, 18))
    const transports = snapshot.servers.map((server) => server.transport)
    const states = snapshot.servers.map((server) => runtimeStateText(lang, server.state))
    const tools = snapshot.servers.map((server) => copy(lang, 'tools', { count: server.tools.length }))
    const headers = [
      copy(lang, 'setColumnName'),
      copy(lang, 'setColumnId'),
      copy(lang, 'setColumnNamespace'),
      copy(lang, 'setColumnTransport'),
      copy(lang, 'setColumnState'),
      copy(lang, 'setColumnTools'),
    ]
    const columns = [names, ids, namespaces, transports, states, tools]
    const widths = headers.map((header, index) => Math.max(
      terminalCellWidth(header),
      ...(columns[index] ?? []).map(terminalCellWidth),
    ))
    const choice = await dialogs.select({
      title: copy(lang, 'setServerPoolTitle', { name: setName }),
      options: [
        { id: 'meta:header', label: `${PAD_CELL.repeat(2)}${columnRow(headers, widths)}` },
        ...snapshot.servers.map((server, index) => ({
          id: `pool-server:${server.id}`,
          label: `${members.has(server.id) ? icons.enable : icons.add}${PAD_CELL}${columnRow(columns.map((column) => column[index] ?? ''), widths)}`,
        })),
        { id: 'new-server', label: iconLabel(icons.add, copy(lang, 'addNewServer')) },
        { id: 'back', label: iconLabel(icons.back, copy(lang, 'back')) },
      ],
      timeoutMs: DIALOG_TIMEOUT_MS,
    })
    if (!choice || choice === 'back') return { snapshot, serverIds: [...serverIds] }
    try {
      if (choice.startsWith('pool-server:')) {
        const serverId = choice.slice('pool-server:'.length)
        const server = snapshot.servers.find((candidate) => candidate.id === serverId)
        if (!server) continue
        const action = await dialogs.select({
          title: copy(lang, 'serverActions', {
            name: server.name,
            tag: stateTag(server.state, icons),
            transport: server.transport,
            tools: copy(lang, 'tools', { count: server.tools.length }),
          }),
          options: [
            {
              id: 'membership',
              label: iconLabel(
                serverIds.has(serverId) ? icons.remove : icons.add,
                copy(lang, serverIds.has(serverId) ? 'removeExistingFromSet' : 'addExistingToSet'),
              ),
            },
            { id: 'delete', label: iconLabel(icons.remove, copy(lang, 'remove')) },
            { id: 'back', label: iconLabel(icons.back, copy(lang, 'back')) },
          ],
          timeoutMs: DIALOG_TIMEOUT_MS,
        })
        if (action === 'membership') {
          if (serverIds.has(serverId)) serverIds.delete(serverId)
          else serverIds.add(serverId)
        }
        if (action === 'delete') {
          const confirmed = await dialogs.confirm({
            title: copy(lang, 'confirmDelete'),
            message: copy(lang, 'confirmDeleteMessage', { name: server.name }),
            confirmLabel: iconLabel(icons.remove, copy(lang, 'confirmDeleteButton')),
            cancelLabel: iconLabel(icons.cancel, copy(lang, 'cancel')),
            timeoutMs: DIALOG_TIMEOUT_MS,
          })
          if (confirmed) {
            snapshot = await manager.invoke('remove', { id: serverId })
            serverIds.delete(serverId)
          }
        }
        continue
      }
      if (choice === 'new-server') {
        const input = await askForServer(dialogs, lang, snapshot, credentials, icons)
        if (!input) continue
        await persistCredentialValues(credentials, input.credentialValues)
        snapshot = await manager.invoke('upsert', { server: input.record })
        serverIds.add(input.record.id)
      }
    } catch (error) {
      await showError(dialogs, lang, icons, error)
    }
  }
}

async function runSetActions(
  ctx: any,
  dialogs: TuiDialogs,
  manager: McpManagerService,
  credentials: CredentialProviderFace,
  icons: IconSet,
  setId: string,
  collapsed: boolean,
): Promise<boolean> {
  while (true) {
    const lang = await resolveTuiLanguage(ctx)
    const snapshot = await manager.invoke('list', {})
    const set = snapshot.sets.find((candidate) => candidate.id === setId)
    if (!set) return false
    const choice = await dialogs.select({
      title: copy(lang, 'setActions', {
        name: setDisplayName(lang, set),
        count: set.serverIds.length,
      }),
      options: [
        { id: 'toggle', label: iconLabel(set.active ? icons.disable : icons.enable, copy(lang, set.active ? 'deactivateSet' : 'activateSet')) },
        { id: 'collapse', label: iconLabel(collapsed ? '▸' : '▾', copy(lang, collapsed ? 'expandSet' : 'collapseSet')) },
        { id: 'edit', label: iconLabel(icons.edit, copy(lang, 'editSet')) },
        { id: 'delete', label: iconLabel(icons.remove, copy(lang, 'deleteSet')) },
        { id: 'back', label: iconLabel(icons.back, copy(lang, 'back')) },
      ],
      timeoutMs: DIALOG_TIMEOUT_MS,
    })
    if (!choice || choice === 'back') return false
    try {
      if (choice === 'collapse') return true
      if (choice === 'toggle') {
        await manager.invoke('toggleSet', { id: set.id, enabled: !set.active })
        continue
      }
      if (choice === 'edit') {
        const updated = await askForSet(dialogs, lang, snapshot, manager, credentials, icons, set)
        if (updated) await manager.invoke('upsertSet', { set: updated })
        continue
      }
      if (choice === 'delete') {
        const confirmed = await dialogs.confirm({
          title: copy(lang, 'confirmDeleteSet'),
          message: copy(lang, 'confirmDeleteSetMessage', { name: set.name }),
          confirmLabel: copy(lang, 'deleteSet'),
          cancelLabel: copy(lang, 'cancel'),
          timeoutMs: DIALOG_TIMEOUT_MS,
        })
        if (confirmed) {
          await manager.invoke('removeSet', { id: set.id })
          return false
        }
      }
    } catch (error) {
      await showError(dialogs, lang, icons, error)
    }
  }
}

async function askForSet(
  dialogs: TuiDialogs,
  lang: UiLang,
  snapshot: McpManagerSnapshot,
  manager: McpManagerService,
  credentials: CredentialProviderFace,
  icons: IconSet,
  existing?: McpSetView,
): Promise<ManagedSetRecord | undefined> {
  let currentSnapshot = snapshot
  const mode = copy(lang, existing ? 'setEditMode' : 'setCreateMode')
  const draft: ManagedSetRecord = {
    id: existing?.id ?? nextSetId(snapshot),
    name: existing?.name ?? '',
    serverIds: [...(existing?.serverIds ?? [])],
  }
  while (true) {
    const members = new Set(draft.serverIds)
    const memberIndexes = currentSnapshot.servers
      .map((server, index) => members.has(server.id) ? index : -1)
      .filter((index) => index >= 0)
    const memberNames = currentSnapshot.servers.map((server) => truncateToCells(server.name, 18))
    const memberIds = currentSnapshot.servers.map((server) => truncateToCells(server.id, 18))
    const memberNamespaces = currentSnapshot.servers.map((server) => truncateToCells(server.serverName, 18))
    const memberTransports = currentSnapshot.servers.map((server) => server.transport)
    const memberStates = currentSnapshot.servers.map((server) => runtimeStateText(lang, server.state))
    const memberTools = currentSnapshot.servers.map((server) => copy(lang, 'tools', { count: server.tools.length }))
    const memberHeaders = [
      copy(lang, 'setColumnName'),
      copy(lang, 'setColumnId'),
      copy(lang, 'setColumnNamespace'),
      copy(lang, 'setColumnTransport'),
      copy(lang, 'setColumnState'),
      copy(lang, 'setColumnTools'),
    ]
    const memberColumns = [
      memberNames,
      memberIds,
      memberNamespaces,
      memberTransports,
      memberStates,
      memberTools,
    ]
    const memberWidths = memberHeaders.map((header, index) => Math.max(
      terminalCellWidth(header),
      ...(memberColumns[index] ?? []).map(terminalCellWidth),
    ))
    const choice = await dialogs.select({
      title: copy(lang, 'setFormTitle', { mode, id: draft.id }),
      options: [
        ...(!existing ? [{ id: 'id', label: `${icons.field} ${copy(lang, 'setId')}${dialogSpacer(copy(lang, 'setId'), 20)}${draft.id}` }] : []),
        { id: 'name', label: `${icons.field} ${copy(lang, 'setName')}${dialogSpacer(copy(lang, 'setName'), 20)}${draft.name || copy(lang, 'valueEmpty')}` },
        {
          id: 'members',
          label: `◆ ${copy(lang, 'setMembers')} ${draft.serverIds.length}/${currentSnapshot.servers.length}`,
        },
        { id: 'members-head', label: `${PAD_CELL.repeat(3)}${columnRow(memberHeaders, memberWidths)}` },
        ...memberIndexes.map((index) => {
          const server = currentSnapshot.servers[index]!
          return {
            id: `member:${server.id}`,
            label: `├─${PAD_CELL}−${PAD_CELL}${columnRow(memberColumns.map((column) => column[index] ?? ''), memberWidths)}`,
          }
        }),
        { id: 'add-member', label: `└─${PAD_CELL}${iconLabel(icons.add, copy(lang, 'setAddMember'))}` },
        { id: 'save', label: iconLabel(icons.save, copy(lang, 'setSave')) },
        { id: 'cancel', label: iconLabel(icons.cancel, copy(lang, 'setCancel')) },
      ],
      timeoutMs: DIALOG_TIMEOUT_MS,
    })
    if (!choice || choice === 'cancel') return undefined
    if (choice === 'members' || choice.startsWith('members-')) continue
    if (choice.startsWith('member:')) {
      const id = choice.slice(7)
      draft.serverIds = draft.serverIds.filter((candidate) => candidate !== id)
      continue
    }
    if (choice === 'add-member') {
      const result = await runDraftServerPool(
        dialogs,
        lang,
        manager,
        credentials,
        icons,
        currentSnapshot,
        draft.name || draft.id,
        draft.serverIds,
      )
      currentSnapshot = result.snapshot
      draft.serverIds = result.serverIds
      continue
    }
    if (choice === 'id') {
      const value = await dialogs.input({
        title: copy(lang, 'setIdPrompt'),
        initial: draft.id,
        placeholder: copy(lang, 'setIdPlaceholder'),
        timeoutMs: DIALOG_TIMEOUT_MS,
      })
      if (value !== undefined) draft.id = value.trim()
      continue
    }
    if (choice === 'name') {
      const value = await dialogs.input({
        title: copy(lang, 'setNamePrompt', { mode }),
        initial: draft.name,
        placeholder: copy(lang, 'setNamePlaceholder'),
        timeoutMs: DIALOG_TIMEOUT_MS,
      })
      if (value !== undefined) draft.name = value.trim()
      continue
    }
    if (choice === 'save') {
      if (!/^[a-z0-9][a-z0-9._-]{0,63}$/.test(draft.id)) {
        await showError(dialogs, lang, icons, new Error(copy(lang, 'invalidSetId')))
        continue
      }
      if (draft.name.length === 0 || draft.name.length > 80) {
        await showError(dialogs, lang, icons, new Error(copy(lang, 'invalidSetName')))
        continue
      }
      return { ...draft, serverIds: [...draft.serverIds] }
    }
  }
}

async function runServerActions(
  ctx: any,
  dialogs: TuiDialogs,
  manager: McpManagerService,
  credentials: CredentialProviderFace,
  icons: IconSet,
  setId: string,
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
    const currentSet = snapshot.sets.find((set) => set.id === setId)
    if (!currentSet) return false

    const choice = await dialogs.select({
      title: copy(lang, 'serverActions', {
        name: server.name,
        tag: stateTag(server.state, icons),
        transport: server.transport,
        tools: copy(lang, 'tools', { count: server.tools.length }),
      }),
      options: [
        { id: 'inspect', label: iconLabel(icons.field, copy(lang, 'inspect')) },
        { id: 'doctor', label: iconLabel(icons.enable, copy(lang, 'doctor')) },
        { id: 'duplicate', label: iconLabel(icons.add, copy(lang, 'duplicate')) },
        {
          id: 'remove-from-set',
          label: iconLabel(icons.remove, copy(lang, 'removeExistingFromSet')),
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
        { id: 'back', label: iconLabel(icons.back, copy(lang, 'back')) },
      ],
      timeoutMs: DIALOG_TIMEOUT_MS,
    })

    if (!choice || choice === 'back') return false

    try {
      if (choice === 'inspect') {
        await runInspector(ctx, dialogs, manager, icons, serverId)
        continue
      }
      if (choice === 'doctor') {
        await runDoctor(ctx, dialogs, manager, icons, serverId)
        continue
      }
      if (choice === 'duplicate') {
        const input = await askForServer(dialogs, lang, snapshot, credentials, icons, server, 'duplicate')
        if (input) {
          await persistCredentialValues(credentials, input.credentialValues)
          await manager.invoke('upsert', { server: input.record })
          await manager.invoke('upsertSet', {
            set: {
              id: currentSet.id,
              name: currentSet.name,
              serverIds: [...new Set([...currentSet.serverIds, input.record.id])],
            },
          })
          return true
        }
        continue
      }
      if (choice === 'remove-from-set') {
        await manager.invoke('upsertSet', {
          set: {
            id: currentSet.id,
            name: currentSet.name,
            serverIds: currentSet.serverIds.filter((id) => id !== serverId),
          },
        })
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
    } catch (error) {
      await showError(dialogs, lang, icons, error)
    }
  }
}

async function runDoctor(
  ctx: any,
  dialogs: TuiDialogs,
  manager: McpManagerService,
  icons: IconSet,
  serverId: string,
): Promise<void> {
  while (true) {
    const lang = await resolveTuiLanguage(ctx)
    let server: McpServerView | undefined
    let report: Awaited<ReturnType<McpManagerService['doctor']>>
    try {
      const snapshot = await manager.invoke('list', {})
      server = snapshot.servers.find((item) => item.id === serverId)
      if (!server) return
      report = await manager.doctor(serverId)
    } catch (error) {
      await showError(dialogs, lang, icons, error)
      return
    }
    const checkWidth = Math.max(...report.checks.map((check) => terminalCellWidth(doctorCheckLabel(lang, check.id))))
    const choice = await dialogs.select({
      title: copy(lang, 'doctorTitle', { name: server.name, state: doctorStateIcon(report.state, icons) }),
      options: [
        ...report.checks.map((check, index) => ({
          id: `check:${index}`,
          label: `${doctorStateIcon(check.state, icons)} ${padToCells(doctorCheckLabel(lang, check.id), checkWidth)}${PAD_CELL.repeat(2)}${truncateToCells(doctorCheckValue(lang, check), 74)}`,
          ...(check.suggestion ? { description: doctorSuggestion(lang, check.suggestion) } : {}),
        })),
        { id: 'again', label: iconLabel(icons.reconnect, copy(lang, 'runAgain')) },
        ...(server.enabled
          ? [{ id: 'reconnect', label: iconLabel(icons.reconnect, copy(lang, 'reconnectAndCheck')) }]
          : []),
        { id: 'back', label: iconLabel(icons.back, copy(lang, 'back')) },
      ],
      timeoutMs: DIALOG_TIMEOUT_MS,
    })
    if (!choice || choice === 'back') return
    if (choice === 'again') continue
    if (choice === 'reconnect') {
      try {
        await manager.invoke('reconnect', { id: serverId })
      } catch (error) {
        await showError(dialogs, lang, icons, error)
      }
      continue
    }
    // Result rows are intentionally non-navigating: the complete report and
    // any actionable suggestion stay visible in this one dialog.
  }
}

function doctorCheckValue(lang: UiLang, check: McpDoctorCheck): string {
  if (check.id === 'loader' && check.state === 'pass') {
    return lang === 'zh'
      ? check.detail.replace('applied', '已应用').replace('Fiber active', 'Fiber 已激活').replace('Fiber is not active yet', 'Fiber 尚未激活')
      : check.detail
  }
  if (check.id === 'tools') return copy(lang, 'tools', { count: check.detail.split(' ')[0] ?? '0' })
  if (check.id === 'runtime' && !check.detail.includes(':')) {
    return runtimeStateText(lang, check.detail as McpServerView['state'])
  }
  return check.detail
}

function runtimeStateText(lang: UiLang, state: McpServerView['state']): string {
  const runtime: Record<McpServerView['state'], { zh: string; en: string }> = {
    connected: { zh: '已连接', en: 'connected' },
    starting: { zh: '正在启动', en: 'starting' },
    reconnecting: { zh: '正在重连', en: 'reconnecting' },
    failed: { zh: '连接失败', en: 'failed' },
    stopped: { zh: '已停止', en: 'stopped' },
    disabled: { zh: '已停用', en: 'disabled' },
  }
  return runtime[state]?.[lang] ?? state
}

function doctorSuggestion(lang: UiLang, suggestion: NonNullable<McpDoctorCheck['suggestion']>): string {
  const keys: Record<NonNullable<McpDoctorCheck['suggestion']>, CopyKey> = {
    'fix-permissions': 'suggestFixPermissions',
    'reload-profile': 'suggestReloadProfile',
    'edit-command': 'suggestEditCommand',
    'edit-url': 'suggestEditUrl',
    'edit-cwd': 'suggestEditCwd',
    'set-credentials': 'suggestSetCredentials',
    'check-auth': 'suggestCheckAuth',
    'check-network': 'suggestCheckNetwork',
    'reconnect-runtime': 'suggestReconnectRuntime',
    'wait-runtime': 'suggestWaitRuntime',
  }
  return copy(lang, keys[suggestion])
}

function doctorStateIcon(state: 'pass' | 'warn' | 'fail', icons: IconSet): string {
  if (state === 'pass') return icons.enable
  if (state === 'warn') return icons.reconnect
  return icons.remove
}

function doctorCheckLabel(lang: UiLang, id: string): string {
  const keys: Record<string, CopyKey> = {
    storage: 'doctorStorage',
    loader: 'doctorLoader',
    target: 'doctorTarget',
    cwd: 'doctorCwd',
    credentials: 'doctorCredentials',
    runtime: 'doctorRuntime',
    tools: 'doctorTools',
  }
  const key = keys[id]
  return key ? copy(lang, key) : id
}

async function runInspector(
  ctx: any,
  dialogs: TuiDialogs,
  manager: McpManagerService,
  icons: IconSet,
  serverId: string,
): Promise<void> {
  while (true) {
    const lang = await resolveTuiLanguage(ctx)
    let server: McpServerView | undefined
    try {
      server = (await manager.invoke('list', {})).servers.find((item) => item.id === serverId)
    } catch (error) {
      await showError(dialogs, lang, icons, error)
      return
    }
    if (!server) return

    const choice = await dialogs.select({
      title: copy(lang, 'serverActions', {
        name: server.name,
        tag: stateTag(server.state, icons),
        transport: server.transport,
        tools: copy(lang, 'tools', { count: server.tools.length }),
      }),
      options: [
        { id: 'overview', label: iconLabel(icons.field, copy(lang, 'overview')) },
        { id: 'tools', label: iconLabel(icons.edit, copy(lang, 'toolList')) },
        ...(server.error ? [{ id: 'error', label: iconLabel(icons.remove, copy(lang, 'latestError')) }] : []),
        { id: 'refresh', label: iconLabel(icons.reconnect, copy(lang, 'refresh')) },
        { id: 'back', label: iconLabel(icons.back, copy(lang, 'back')) },
      ],
      timeoutMs: DIALOG_TIMEOUT_MS,
    })
    if (!choice || choice === 'back') return
    if (choice === 'overview') await showServerOverview(dialogs, lang, icons, server)
    if (choice === 'tools') await runToolInspector(dialogs, lang, icons, server)
    if (choice === 'error') {
      await showDetail(dialogs, copy(lang, 'latestError'), server.error ?? copy(lang, 'noError'), lang, icons)
    }
  }
}

async function showServerOverview(
  dialogs: TuiDialogs,
  lang: UiLang,
  icons: IconSet,
  server: McpServerView,
): Promise<void> {
  const credentials = [
    ...Object.values(server.secretEnv ?? {}).map((entry) => entry.credential),
    ...Object.values(server.secretHeaders ?? {}).map((entry) => entry.credential),
  ]
  const configured = credentials.filter((item) => item.configured).length
  const target = server.transport === 'stdio'
    ? [server.command, ...(server.args ?? [])].filter(Boolean).join(' ')
    : (server.url ?? '')
  const rows = [
    [copy(lang, 'configState'), `${stateTag(server.state, icons)} ${server.state}`],
    [copy(lang, 'configTransport'), server.transport],
    [copy(lang, 'configTarget'), target || copy(lang, 'valueEmpty')],
    [copy(lang, 'configUpdated'), new Date(server.updatedAt).toLocaleString(lang === 'zh' ? 'zh-CN' : 'en-US')],
    [copy(lang, 'configCredentials'), `${configured}/${credentials.length}`],
    [copy(lang, 'configReconnect'), server.reconnect?.enabled === false ? copy(lang, 'disabled') : copy(lang, 'enabled')],
    [copy(lang, 'configTimeout'), copy(lang, 'valueMilliseconds', { value: server.toolCallTimeoutMs ?? 60_000 })],
  ] as const
  await runReadOnlyRows(dialogs, server.name, rows, lang, icons)
}

async function runToolInspector(
  dialogs: TuiDialogs,
  lang: UiLang,
  icons: IconSet,
  server: McpServerView,
): Promise<void> {
  if (server.tools.length === 0) {
    await showDetail(dialogs, copy(lang, 'toolList'), copy(lang, 'noTools'), lang, icons)
    return
  }
  while (true) {
    const visible = server.tools.slice(0, 98)
    const choice = await dialogs.select({
      title: `${server.name} | ${copy(lang, 'tools', { count: server.tools.length })}`,
      options: [
        ...visible.map((tool, index) => ({
          id: `tool:${index}`,
          label: iconLabel(icons.field, shortToolName(tool.name, server.serverName)),
        })),
        { id: 'back', label: iconLabel(icons.back, copy(lang, 'back')) },
      ],
      timeoutMs: DIALOG_TIMEOUT_MS,
    })
    if (!choice || choice === 'back') return
    const tool = visible[Number(choice.slice('tool:'.length))]
    if (tool) await showTool(dialogs, lang, icons, tool, server.serverName)
  }
}

async function showTool(
  dialogs: TuiDialogs,
  lang: UiLang,
  icons: IconSet,
  tool: McpToolView,
  serverName: string,
): Promise<void> {
  const schema = tool.parameters ?? {}
  const properties = isRecord(schema.properties) ? schema.properties : {}
  const required = new Set(Array.isArray(schema.required)
    ? schema.required.filter((item): item is string => typeof item === 'string')
    : [])
  const entries = Object.entries(properties).slice(0, 96)
  while (true) {
    const choice = await dialogs.select({
      title: copy(lang, 'toolTitle', {
        name: shortToolName(tool.name, serverName),
        count: Object.keys(properties).length,
      }),
      options: [
        { id: 'description', label: iconLabel(icons.field, copy(lang, 'description')) },
        ...entries.map(([name, value], index) => ({
          id: `property:${index}`,
          label: `${required.has(name) ? icons.enable : icons.disable} ${name}${PAD_CELL.repeat(2)}${schemaType(value)}${PAD_CELL.repeat(2)}${copy(lang, required.has(name) ? 'required' : 'optional')}`,
        })),
        { id: 'schema', label: iconLabel(icons.edit, copy(lang, 'schema')) },
        { id: 'back', label: iconLabel(icons.back, copy(lang, 'back')) },
      ],
      timeoutMs: DIALOG_TIMEOUT_MS,
    })
    if (!choice || choice === 'back') return
    if (choice === 'description') {
      await showDetail(dialogs, copy(lang, 'description'), tool.description || copy(lang, 'valueEmpty'), lang, icons)
    }
    if (choice === 'schema') await showDetail(dialogs, copy(lang, 'schema'), compactJson(schema), lang, icons)
    if (choice.startsWith('property:')) {
      const entry = entries[Number(choice.slice('property:'.length))]
      if (entry) await showDetail(dialogs, entry[0], schemaSummary(entry[1]), lang, icons)
    }
  }
}

async function runReadOnlyRows(
  dialogs: TuiDialogs,
  title: string,
  rows: readonly (readonly [string, string])[],
  lang: UiLang,
  icons: IconSet,
): Promise<void> {
  const width = Math.max(...rows.map(([label]) => terminalCellWidth(label)))
  const choice = await dialogs.select({
    title,
    options: [
      ...rows.map(([label, value], index) => ({
        id: `row:${index}`,
        label: `${padToCells(label, width)}${PAD_CELL.repeat(2)}${truncateToCells(value, 80)}`,
      })),
      { id: 'back', label: iconLabel(icons.back, copy(lang, 'back')) },
    ],
    timeoutMs: DIALOG_TIMEOUT_MS,
  })
  if (choice?.startsWith('row:')) {
    const row = rows[Number(choice.slice('row:'.length))]
    if (row) await showDetail(dialogs, row[0], row[1], lang, icons)
  }
}

async function showDetail(
  dialogs: TuiDialogs,
  title: string,
  value: string,
  lang: UiLang,
  icons: IconSet,
): Promise<void> {
  await dialogs.select({
    title,
    options: [{
      id: 'ok',
      label: iconLabel(icons.ok, copy(lang, 'ok')),
      description: truncateToCells(value, 380),
    }],
    timeoutMs: DIALOG_TIMEOUT_MS,
  })
}

function shortToolName(name: string, serverName: string): string {
  const prefix = `mcp__${serverName}__`
  return name.startsWith(prefix) ? name.slice(prefix.length) : name
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function schemaType(value: unknown): string {
  if (!isRecord(value)) return typeof value
  if (typeof value.type === 'string') return value.type
  if (Array.isArray(value.type)) return value.type.map(String).join('|')
  if (Array.isArray(value.enum)) return 'enum'
  if (value.oneOf || value.anyOf) return 'union'
  return 'value'
}

function schemaSummary(value: unknown): string {
  if (!isRecord(value)) return compactJson(value)
  const parts = [schemaType(value)]
  if (typeof value.description === 'string' && value.description) parts.push(value.description)
  if (value.default !== undefined) parts.push(`default=${compactJson(value.default)}`)
  if (Array.isArray(value.enum)) parts.push(`enum=${value.enum.map(String).join(', ')}`)
  return parts.join(' | ')
}

function compactJson(value: unknown): string {
  try {
    return JSON.stringify(value)
  } catch {
    return String(value)
  }
}

async function askForServer(
  dialogs: TuiDialogs,
  lang: UiLang,
  snapshot: McpManagerSnapshot,
  credentials: CredentialProviderFace,
  icons: IconSet,
  existing?: McpServerView,
  intent: 'add' | 'edit' | 'duplicate' = existing ? 'edit' : 'add',
): Promise<ServerFormSubmission | undefined> {
  const mode = copy(lang, intent === 'duplicate' ? 'duplicateMode' : intent === 'edit' ? 'editMode' : 'addMode')
  const duplicate = intent === 'duplicate' && existing !== undefined
  const draft = {
    id: duplicate ? nextDuplicateId(snapshot, existing.id) : existing?.id ?? nextServerId(snapshot),
    displayName: duplicate ? `${existing.name}${lang === 'zh' ? ' 副本' : ' copy'}` : existing?.name ?? '',
    serverName: duplicate ? nextDuplicateServerName(snapshot, existing.serverName) : existing?.serverName ?? '',
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
    enabled: duplicate ? false : existing?.enabled ?? true,
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
    if (intent !== 'edit') {
      steps.push(inputStep(
        'id',
        copy(lang, 'serverId', { mode }),
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

function serverListOptions(
  lang: UiLang,
  servers: readonly McpServerView[],
  icons: IconSet,
  prefix = '',
  idPrefix = 'server:',
  alignmentServers: readonly McpServerView[] = servers,
  hasFollowingSibling = false,
) {
  const names = servers.map((server) => truncateToCells(server.name, 24))
  const toolCounts = servers.map((server) =>
    server.tools.length === 0 && (server.state === 'starting' || server.state === 'reconnecting')
      ? '...'
      : String(server.tools.length),
  )
  const nameWidth = Math.max(0, ...alignmentServers.map((server) => terminalCellWidth(truncateToCells(server.name, 24))))
  const tagWidth = Math.max(0, ...alignmentServers.map((server) => terminalCellWidth(stateTag(server.state, icons))))
  const toolCountWidth = Math.max(1, ...alignmentServers.map((server) => terminalCellWidth(String(server.tools.length))))

  return servers.map((server, index) => ({
    id: `${idPrefix}${server.id}`,
    label: `${prefix}${index === servers.length - 1 && !hasFollowingSibling ? '└─' : '├─'}${PAD_CELL}${[
        padToCells(names[index] ?? server.name, nameWidth),
        padToCells(stateTag(server.state, icons), tagWidth),
        copy(lang, 'tools', { count: (toolCounts[index] ?? '0').padStart(toolCountWidth, PAD_CELL) }),
      ].join(PAD_CELL.repeat(2))}`,
  }))
}

function stateTag(state: McpServerView['state'], icons: IconSet): string {
  return icons.states[state]
}

function setDisplayName(lang: UiLang, set: McpSetView): string {
  return set.id === 'default' && set.name === 'Default' ? copy(lang, 'noActiveSet') : set.name
}

// The managed-dialog sanitizer collapses every Unicode whitespace run. U+2800
// is a single-cell blank glyph rather than whitespace, so table padding
// survives the public dialog boundary and keeps terminal columns aligned.
const PAD_CELL = '\u2800'

function dialogSpacer(text: string, targetWidth: number): string {
  return PAD_CELL.repeat(Math.max(2, targetWidth - terminalCellWidth(text)))
}

function terminalCellWidth(text: string): number {
  let width = 0
  for (const character of text) width += characterCellWidth(character)
  return width
}

function padToCells(text: string, width: number): string {
  return text + PAD_CELL.repeat(Math.max(0, width - terminalCellWidth(text)))
}

function columnRow(cells: readonly string[], widths: readonly number[]): string {
  return cells.map((cell, index) => padToCells(cell, widths[index] ?? terminalCellWidth(cell))).join(PAD_CELL.repeat(2))
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

function nextSetId(snapshot: McpManagerSnapshot): string {
  const existing = new Set(snapshot.sets.map((set) => set.id))
  for (let index = 1; ; index += 1) {
    const candidate = `set-${index}`
    if (!existing.has(candidate)) return candidate
  }
}

function nextDuplicateId(snapshot: McpManagerSnapshot, source: string): string {
  const existing = new Set(snapshot.servers.map((server) => server.id))
  for (let index = 1; ; index += 1) {
    const suffix = index === 1 ? '-copy' : `-copy-${index}`
    const candidate = `${source.slice(0, 64 - suffix.length)}${suffix}`
    if (!existing.has(candidate)) return candidate
  }
}

function nextDuplicateServerName(snapshot: McpManagerSnapshot, source: string): string {
  const existing = new Set(snapshot.servers.map((server) => server.serverName))
  for (let index = 1; ; index += 1) {
    const suffix = index === 1 ? '_copy' : `_copy${index}`
    const candidate = `${source.slice(0, 32 - suffix.length)}${suffix}`
    if (!existing.has(candidate)) return candidate
  }
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

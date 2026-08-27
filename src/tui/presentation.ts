import type { McpDoctorCheck, McpServerView } from '../host/types.js'

export type UiLanguage = 'zh' | 'en'

export type DoctorCheckStringKey =
  | 'doctorStorage'
  | 'doctorLoader'
  | 'doctorTarget'
  | 'doctorCwd'
  | 'doctorCredentials'
  | 'doctorRuntime'
  | 'doctorTools'

export type DoctorSuggestionStringKey =
  | 'suggestFixPermissions'
  | 'suggestReloadProfile'
  | 'suggestEditCommand'
  | 'suggestEditUrl'
  | 'suggestEditCwd'
  | 'suggestSetCredentials'
  | 'suggestCheckAuth'
  | 'suggestCheckNetwork'
  | 'suggestReconnectRuntime'
  | 'suggestWaitRuntime'

export function doctorCheckStringKey(id: McpDoctorCheck['id']): DoctorCheckStringKey {
  const keys: Record<McpDoctorCheck['id'], DoctorCheckStringKey> = {
    storage: 'doctorStorage',
    loader: 'doctorLoader',
    target: 'doctorTarget',
    cwd: 'doctorCwd',
    credentials: 'doctorCredentials',
    runtime: 'doctorRuntime',
    tools: 'doctorTools',
  }
  return keys[id]
}

export function doctorSuggestionStringKey(
  suggestion: NonNullable<McpDoctorCheck['suggestion']>,
): DoctorSuggestionStringKey {
  const keys: Record<NonNullable<McpDoctorCheck['suggestion']>, DoctorSuggestionStringKey> = {
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
  return keys[suggestion]
}

export function runtimeStateText(lang: UiLanguage, state: McpServerView['state']): string {
  const labels: Record<McpServerView['state'], Record<UiLanguage, string>> = {
    connected: { zh: '已连接', en: 'connected' },
    starting: { zh: '正在启动', en: 'starting' },
    reconnecting: { zh: '正在重连', en: 'reconnecting' },
    failed: { zh: '连接失败', en: 'failed' },
    stopped: { zh: '已停止', en: 'stopped' },
    disabled: { zh: '已停用', en: 'disabled' },
  }
  return labels[state][lang]
}

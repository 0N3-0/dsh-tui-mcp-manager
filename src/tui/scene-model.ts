import type {
  ManagedSetRecord,
  McpManagerSnapshot,
  McpServerView,
  McpSetView,
} from '../host/types.js'
import type { ServerFormDraft, ServerFormIntent } from './server-form-model.js'

export type SceneTab = 'overview' | 'tools' | 'doctor' | 'config'
export type Workspace = 'servers' | 'sets'
export type FocusArea = 'navigation' | 'detail'

export type NavItem =
  | { kind: 'server'; key: string; server: McpServerView }
  | { kind: 'set'; key: string; set: McpSetView }

export type ConfirmAction =
  | { kind: 'remove-server'; id: string; label: string }
  | { kind: 'remove-set'; id: string; label: string }

export type SetEditorRow =
  | { kind: 'field'; field: 'id' | 'name'; editable: boolean }
  | { kind: 'member'; server: McpServerView }
  | { kind: 'save' }
  | { kind: 'cancel' }

export interface SetEditorState {
  mode: 'create' | 'edit'
  draft: ManagedSetRecord
  selected: number
  editing?: 'id' | 'name'
  error?: string
}

export type ServerTextField =
  | 'id'
  | 'displayName'
  | 'serverName'
  | 'command'
  | 'args'
  | 'cwd'
  | 'env'
  | 'secretEnv'
  | 'url'
  | 'headers'
  | 'secretHeaders'
  | 'toolCallTimeoutMs'
  | 'reconnectInitialDelayMs'
  | 'reconnectMaxDelayMs'
  | 'reconnectMaxAttempts'

export type ServerEditorRow =
  | { kind: 'field'; field: ServerTextField; editable: boolean }
  | { kind: 'transport' }
  | { kind: 'boolean'; field: 'failOnStartupError' | 'reconnectEnabled' }
  | { kind: 'credential'; ref: string }
  | { kind: 'save' }
  | { kind: 'cancel' }

export interface ServerEditorState {
  intent: ServerFormIntent
  originalId?: string
  draft: ServerFormDraft
  selected: number
  editing?: { kind: 'field'; field: ServerTextField } | { kind: 'credential'; ref: string }
  error?: string
}

export const SCENE_POLL_MS = 10_000
export const TABS: readonly SceneTab[] = ['overview', 'tools', 'doctor', 'config']
export const WORKSPACES: readonly Workspace[] = ['sets', 'servers']

export function clamp(index: number, length: number): number {
  return Math.min(Math.max(0, index), Math.max(0, length - 1))
}

export function nextSetId(snapshot: McpManagerSnapshot): string {
  const existing = new Set(snapshot.sets.map((set) => set.id))
  for (let index = 1; ; index += 1) {
    const candidate = `set-${index}`
    if (!existing.has(candidate)) return candidate
  }
}

export function removeLastCodePoint(value: string): string {
  const points = Array.from(value)
  points.pop()
  return points.join('')
}

export function navWindow(items: readonly NavItem[], selected: number, limit: number): readonly NavItem[] {
  if (items.length <= limit) return items
  const start = Math.min(Math.max(0, selected - Math.floor(limit / 2)), items.length - limit)
  return items.slice(start, start + limit)
}

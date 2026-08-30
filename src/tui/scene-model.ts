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
  | { kind: 'boolean'; field: 'active' }
  | { kind: 'search' }
  | { kind: 'member'; server: McpServerView }
  | { kind: 'save' }
  | { kind: 'cancel' }

export interface SetEditorDraft extends ManagedSetRecord {
  active: boolean
}

export interface SetEditorState {
  mode: 'create' | 'edit'
  draft: SetEditorDraft
  selected: number
  memberFilter: string
  memberSearchCursor?: number
  editing?: { field: 'id' | 'name'; cursor: number }
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
  editing?:
    | { kind: 'field'; field: ServerTextField; cursor: number }
    | { kind: 'credential'; ref: string; cursor: number }
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

export function matchesSearch(query: string, ...values: Array<string | undefined>): boolean {
  const terms = query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean)
  if (terms.length === 0) return true
  const haystack = values.filter((value): value is string => value !== undefined).join('\n').toLocaleLowerCase()
  return terms.every((term) => haystack.includes(term))
}

export function matchesNavItem(query: string, item: NavItem): boolean {
  return item.kind === 'server'
    ? matchesSearch(query, item.server.name, item.server.id, item.server.serverName)
    : matchesSearch(query, item.set.name, item.set.id)
}

export interface TextCursorUpdate {
  value: string
  cursor: number
}

export function textCursorEnd(value: string): number {
  return Array.from(value).length
}

export function clampTextCursor(value: string, cursor: number): number {
  return Math.min(Math.max(0, Math.trunc(cursor)), textCursorEnd(value))
}

export function insertAtTextCursor(
  value: string,
  cursor: number,
  inserted: string,
  limit: number,
): TextCursorUpdate {
  const points = Array.from(value)
  const position = clampTextCursor(value, cursor)
  const insertedPoints = Array.from(inserted).slice(0, Math.max(0, limit - points.length))
  return {
    value: [...points.slice(0, position), ...insertedPoints, ...points.slice(position)].join(''),
    cursor: position + insertedPoints.length,
  }
}

export function removeBeforeTextCursor(value: string, cursor: number): TextCursorUpdate {
  const points = Array.from(value)
  const position = clampTextCursor(value, cursor)
  if (position === 0) return { value, cursor: 0 }
  points.splice(position - 1, 1)
  return { value: points.join(''), cursor: position - 1 }
}

export function removeAtTextCursor(value: string, cursor: number): TextCursorUpdate {
  const points = Array.from(value)
  const position = clampTextCursor(value, cursor)
  if (position === points.length) return { value, cursor: position }
  points.splice(position, 1)
  return { value: points.join(''), cursor: position }
}

function codePointCellWidth(value: string): number {
  const codePoint = value.codePointAt(0) ?? 0
  if (
    (codePoint >= 0x0300 && codePoint <= 0x036f)
    || (codePoint >= 0x1ab0 && codePoint <= 0x1aff)
    || (codePoint >= 0x1dc0 && codePoint <= 0x1dff)
    || (codePoint >= 0x20d0 && codePoint <= 0x20ff)
    || (codePoint >= 0xfe00 && codePoint <= 0xfe0f)
    || (codePoint >= 0xfe20 && codePoint <= 0xfe2f)
  ) return 0
  if (
    codePoint >= 0x1100 && (
      codePoint <= 0x115f
      || codePoint === 0x2329
      || codePoint === 0x232a
      || (codePoint >= 0x2e80 && codePoint <= 0xa4cf && codePoint !== 0x303f)
      || (codePoint >= 0xac00 && codePoint <= 0xd7a3)
      || (codePoint >= 0xf900 && codePoint <= 0xfaff)
      || (codePoint >= 0xfe10 && codePoint <= 0xfe19)
      || (codePoint >= 0xfe30 && codePoint <= 0xfe6f)
      || (codePoint >= 0xff00 && codePoint <= 0xff60)
      || (codePoint >= 0xffe0 && codePoint <= 0xffe6)
      || (codePoint >= 0x1f300 && codePoint <= 0x1faff)
      || (codePoint >= 0x20000 && codePoint <= 0x3fffd)
    )
  ) return 2
  return 1
}

export function terminalTextWidth(value: string): number {
  return Array.from(value).reduce((width, point) => width + codePointCellWidth(point), 0)
}

export function truncateTerminalText(value: string, maxWidth: number): string {
  const capacity = Math.max(1, Math.trunc(maxWidth))
  if (terminalTextWidth(value) <= capacity) return value
  if (capacity === 1) return '…'
  const points: string[] = []
  let width = 0
  for (const point of Array.from(value)) {
    const pointWidth = codePointCellWidth(point)
    if (width + pointWidth > capacity - 1) break
    points.push(point)
    width += pointWidth
  }
  return `${points.join('')}…`
}

export interface TextCursorSegments {
  before: string
  cursor: string
  after: string
}

export function textCursorSegments(
  value: string,
  cursor: number,
  maxWidth = 40,
  masked = false,
): TextCursorSegments {
  const source = Array.from(value)
  const points = masked ? source.map(() => '•') : source
  const position = clampTextCursor(value, cursor)
  const capacity = Math.max(3, Math.trunc(maxWidth))
  const atEnd = position === points.length
  const cursorPoint = atEnd ? ' ' : points[position]
  const fullWidth = terminalTextWidth(points.join('')) + (atEnd ? 1 : 0)
  if (fullWidth <= capacity) {
    return {
      before: points.slice(0, position).join(''),
      cursor: cursorPoint,
      after: points.slice(position + (atEnd ? 0 : 1)).join(''),
    }
  }

  let start = position
  let end = position + (atEnd ? 0 : 1)
  let preferLeft = true
  const windowWidth = (candidateStart: number, candidateEnd: number): number => (
    terminalTextWidth(points.slice(candidateStart, candidateEnd).join(''))
    + (atEnd ? 1 : 0)
    + (candidateStart > 0 ? 1 : 0)
    + (candidateEnd < points.length ? 1 : 0)
  )
  while (start > 0 || end < points.length) {
    let expanded = false
    const expandLeft = (): boolean => {
      if (start > 0 && windowWidth(start - 1, end) <= capacity) {
        start -= 1
        return true
      }
      return false
    }
    const expandRight = (): boolean => {
      if (end < points.length && windowWidth(start, end + 1) <= capacity) {
        end += 1
        return true
      }
      return false
    }
    if (preferLeft) expanded = expandLeft() || expandRight()
    else expanded = expandRight() || expandLeft()
    if (!expanded) break
    preferLeft = !preferLeft
  }
  return {
    before: `${start > 0 ? '…' : ''}${points.slice(start, position).join('')}`,
    cursor: cursorPoint,
    after: `${points.slice(position + (atEnd ? 0 : 1), end).join('')}${end < points.length ? '…' : ''}`,
  }
}

export function navWindow(items: readonly NavItem[], selected: number, limit: number): readonly NavItem[] {
  if (items.length <= limit) return items
  const start = Math.min(Math.max(0, selected - Math.floor(limit / 2)), items.length - limit)
  return items.slice(start, start + limit)
}

export interface IndexedWindow<T> {
  start: number
  items: readonly T[]
}

export function indexedWindow<T>(items: readonly T[], selected: number, limit: number): IndexedWindow<T> {
  const capacity = Math.max(1, Math.trunc(limit))
  if (items.length <= capacity) return { start: 0, items }
  const index = clamp(selected, items.length)
  const start = Math.min(
    Math.max(0, index - Math.floor(capacity / 2)),
    items.length - capacity,
  )
  return { start, items: items.slice(start, start + capacity) }
}

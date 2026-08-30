import type { TuiSceneProps } from '@deepseek-harness-tui/dsh-tui/scenes'
import type { McpManagerSnapshot, McpServerView, McpSetView } from '../host/types.js'
import {
  runtimeStateText,
  sceneText as text,
  type SceneLanguage,
} from './scene-i18n.js'
import { terminalTextWidth, textCursorSegments, truncateTerminalText, type SetEditorRow, type SetEditorState } from './scene-model.js'
import { serverStateColor, serverStateGlyph } from './scene-server-detail.js'

interface SetEditorViewProps {
  React: TuiSceneProps['React']
  ui: TuiSceneProps['ui']
  lang: SceneLanguage
  snapshot: McpManagerSnapshot | undefined
  editor: SetEditorState
  rows: readonly SetEditorRow[]
  rowWidth: number
  activateRow(index: number): void
}

interface SetDetailViewProps {
  React: TuiSceneProps['React']
  ui: TuiSceneProps['ui']
  lang: SceneLanguage
  snapshot: McpManagerSnapshot | undefined
  set: McpSetView
  focusArea: 'navigation' | 'detail'
  selectedMemberIndex: number
  activateMember(index: number): void
}

export function setEditorSelectionHelp(
  lang: SceneLanguage,
  editor: SetEditorState,
  rows: readonly SetEditorRow[],
): string {
  const row = rows[editor.selected]
  if (row?.kind === 'field') return text(lang, row.field === 'id' ? 'helpSetId' : 'helpSetName')
  if (row?.kind === 'boolean') return text(lang, 'helpEnableAtStartup')
  if (row?.kind === 'search') return text(lang, 'helpSearchMembers')
  if (row?.kind === 'member') return text(lang, 'helpSetMember').replace('{server}', row.server.name)
  return text(lang, row?.kind === 'save' ? 'helpSave' : 'helpCancel')
}

export function renderSetEditorView({
  React,
  ui,
  lang,
  snapshot,
  editor,
  rows,
  rowWidth,
  activateRow,
}: SetEditorViewProps) {
  const { Box, Text } = ui
  const h = React.createElement
  return h(
    React.Fragment,
    null,
    h(Text, { color: 'subtle', wrap: 'wrap' }, text(lang, 'setEditorHint')),
    h(Text, { color: 'permission' },
      `${text(lang, 'setMembers')}: ${editor.draft.serverIds.length}/${snapshot?.servers.length ?? 0}`,
    ),
    editor.error !== undefined && h(
      Box,
      { marginTop: 1, borderStyle: 'round', borderColor: 'error', paddingX: 1 },
      h(Text, { color: 'error', wrap: 'wrap' }, editor.error),
    ),
    h(Box, { height: 1 }),
    ...rows.map((item, index) => {
      const focused = index === editor.selected
      const common = {
        key: item.kind === 'field'
          ? `field:${item.field}`
          : item.kind === 'boolean'
            ? `boolean:${item.field}`
            : item.kind === 'member' ? `member:${item.server.id}` : item.kind,
        flexDirection: 'row' as const,
        minHeight: 1,
        paddingX: 1,
        onClick: () => activateRow(index),
      }
      if (item.kind === 'field') {
        const value = editor.draft[item.field]
        const editing = editor.editing?.field === item.field ? editor.editing : undefined
        const label = `${text(lang, item.field === 'id' ? 'setId' : 'setName')}: `
        const action = text(lang, 'editValue')
        const valueWidth = Math.max(8, rowWidth - terminalTextWidth(label) - 4
          - (editing === undefined && item.editable ? terminalTextWidth(action) + 1 : 0))
        const cursor = editing === undefined
          ? undefined
          : textCursorSegments(value, editing.cursor, valueWidth)
        return h(
          Box,
          common,
          h(Text, { color: focused ? undefined : 'subtle' }, focused ? '\u276f ' : '  '),
          h(Text, { color: value.trim() === '' ? 'error' : 'warning' }, '* '),
          h(Text, { color: 'permission' }, label),
          h(Text, {
            bold: focused,
            color: !item.editable ? 'subtle' : value.trim() === '' ? 'error' : undefined,
            wrap: 'truncate-end',
          },
            editing === undefined
              ? truncateTerminalText(value || text(lang, 'valueEmpty'), valueWidth)
              : h(React.Fragment, null,
                  cursor?.before,
                  h(Text, { inverse: true }, cursor?.cursor),
                  cursor?.after,
                ),
          ),
          h(Box, { flexGrow: 1 }),
          editing === undefined && item.editable && h(Text, { color: 'subtle' }, action),
        )
      }
      if (item.kind === 'member') {
        const member = editor.draft.serverIds.includes(item.server.id)
        return h(
          Box,
          common,
          h(Text, { color: focused ? undefined : 'subtle' }, focused ? '\u276f ' : '  '),
          h(Text, null, '  '),
          h(Text, { color: member ? 'success' : 'inactive' }, `${member ? '\u2713' : '\u25cb'} `),
          h(Text, { bold: focused, wrap: 'truncate-end' }, item.server.name),
          h(Box, { flexGrow: 1 }),
          h(Text, { color: serverStateColor(item.server.state) }, runtimeStateText(lang, item.server.state)),
          h(Text, { color: 'subtle' }, `  ${item.server.tools.length}`),
        )
      }
      if (item.kind === 'search') {
        const searching = editor.memberSearchCursor !== undefined
        const matchCount = rows.filter((row) => row.kind === 'member').length
        const count = `${matchCount}/${snapshot?.servers.length ?? 0}`
        const label = `${text(lang, 'searchMembers')}: `
        const value = editor.memberFilter
        const valueWidth = Math.max(8, rowWidth - terminalTextWidth(label) - terminalTextWidth(count) - 6)
        const cursor = searching
          ? textCursorSegments(value, editor.memberSearchCursor!, valueWidth)
          : undefined
        return h(
          Box,
          common,
          h(Text, { color: focused ? undefined : 'subtle' }, focused ? '\u276f ' : '  '),
          h(Text, null, '  '),
          h(Text, { color: 'permission' }, label),
          h(Text, { bold: focused, color: value === '' ? 'subtle' : undefined, wrap: 'truncate-end' },
            searching
              ? h(React.Fragment, null,
                  cursor?.before,
                  h(Text, { inverse: true }, cursor?.cursor),
                  cursor?.after,
                )
              : truncateTerminalText(value || text(lang, 'allItems'), valueWidth),
          ),
          h(Box, { flexGrow: 1 }),
          h(Text, { color: matchCount === 0 ? 'warning' : 'subtle' }, count),
        )
      }
      if (item.kind === 'boolean') {
        const enabled = editor.draft[item.field]
        return h(
          Box,
          common,
          h(Text, { color: focused ? undefined : 'subtle' }, focused ? '\u276f ' : '  '),
          h(Text, null, '  '),
          h(Text, { color: 'permission' }, `${text(lang, 'enableAtStartup')}: `),
          h(Text, { color: enabled ? 'success' : 'inactive', bold: focused }, text(lang, enabled ? 'enabled' : 'disabled')),
          h(Box, { flexGrow: 1 }),
          h(Text, { color: 'subtle' }, text(lang, 'toggleOption')),
        )
      }
      return h(
        Box,
        common,
        h(Text, { color: focused ? undefined : 'subtle' }, focused ? '\u276f ' : '  '),
        h(Text, { bold: focused, color: item.kind === 'save' ? 'success' : 'inactive' },
          `${item.kind === 'save' ? '\u2713' : '\u00d7'} ${text(lang, item.kind)}`,
        ),
      )
    }),
  )
}

export function renderSetDetailView({
  React,
  ui,
  lang,
  snapshot,
  set,
  focusArea,
  selectedMemberIndex,
  activateMember,
}: SetDetailViewProps) {
  const { Box, Text } = ui
  const h = React.createElement
  const row = (label: string, value: string, color?: 'success' | 'inactive') => h(
    Box,
    { flexDirection: 'row', minHeight: 1 },
    h(Text, { color: 'subtle' }, `${label}: `),
    h(Text, { color, wrap: 'wrap' }, value || '-'),
  )
  const members = set.serverIds.map((id) => snapshot?.servers.find((server: McpServerView) => server.id === id))
  return h(
    React.Fragment,
    null,
    row(text(lang, 'active'), text(lang, set.active ? 'active' : 'inactive'), set.active ? 'success' : 'inactive'),
    row(text(lang, 'members'), String(set.serverIds.length)),
    h(Box, { marginTop: 1, flexDirection: 'column' },
      ...members.map((server, index) => {
        const focused = focusArea === 'detail' && index === selectedMemberIndex
        return h(
          Box,
          {
            key: set.serverIds[index],
            flexDirection: 'row',
            paddingX: 1,
            backgroundColor: focused ? 'selectionBg' : undefined,
            onClick: () => activateMember(index),
          },
          h(Text, { color: focused ? undefined : 'subtle' }, focused ? '\u276f ' : '  '),
          h(Text, { color: focused ? undefined : server === undefined ? 'error' : serverStateColor(server.state) },
            server === undefined ? '? ' : `${serverStateGlyph(server.state)} `,
          ),
          h(Text, {
            bold: focused || server?.enabled === true,
            color: focused ? undefined : server?.enabled ? 'suggestion' : undefined,
          }, server?.name ?? set.serverIds[index]),
          h(Box, { flexGrow: 1 }),
          h(Text, { color: focused ? undefined : 'subtle' }, server === undefined ? '' : String(server.tools.length)),
        )
      }),
    ),
    h(Box, { marginTop: 1 }, h(Text, { color: 'subtle' }, text(lang, 'setHint'))),
  )
}

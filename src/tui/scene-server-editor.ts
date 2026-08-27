import type { TuiSceneProps } from '@deepseek-harness-tui/dsh-tui/scenes'
import type { McpManagerSnapshot, McpServerView } from '../host/types.js'
import { sceneText as text, type SceneLanguage } from './scene-i18n.js'
import type {
  ServerEditorRow,
  ServerEditorState,
  ServerTextField,
} from './scene-model.js'

interface ServerEditorViewProps {
  React: TuiSceneProps['React']
  ui: TuiSceneProps['ui']
  lang: SceneLanguage
  snapshot: McpManagerSnapshot | undefined
  editor: ServerEditorState
  rows: readonly ServerEditorRow[]
  activateRow(index: number): void
}

function serverFieldLabel(lang: SceneLanguage, field: ServerTextField): string {
  switch (field) {
    case 'id': return text(lang, 'serverId')
    case 'displayName': return text(lang, 'displayName')
    case 'serverName': return text(lang, 'serverName')
    case 'command': return text(lang, 'command')
    case 'args': return text(lang, 'arguments')
    case 'cwd': return text(lang, 'workingDirectory')
    case 'env': return text(lang, 'environment')
    case 'secretEnv': return text(lang, 'secretEnv')
    case 'url': return text(lang, 'endpoint')
    case 'headers': return text(lang, 'headers')
    case 'secretHeaders': return text(lang, 'secretHeaders')
    case 'toolCallTimeoutMs': return text(lang, 'timeout')
    case 'reconnectInitialDelayMs': return text(lang, 'reconnectInitialDelay')
    case 'reconnectMaxDelayMs': return text(lang, 'reconnectMaxDelay')
    case 'reconnectMaxAttempts': return text(lang, 'reconnectMaxAttempts')
  }
}

function isCredentialConfigured(snapshot: McpManagerSnapshot | undefined, ref: string): boolean {
  return (snapshot?.servers ?? []).some((server: McpServerView) => {
    const entries = [
      ...Object.values(server.secretEnv ?? {}),
      ...Object.values(server.secretHeaders ?? {}),
    ] as Array<{ ref: string; credential: { configured: boolean } }>
    return entries.some((entry) => entry.ref === ref && entry.credential.configured)
  })
}

export function renderServerEditorView({
  React,
  ui,
  lang,
  snapshot,
  editor,
  rows,
  activateRow,
}: ServerEditorViewProps) {
  const { Box, Text } = ui
  const h = React.createElement
  return h(
    React.Fragment,
    null,
    h(Text, { color: 'subtle', wrap: 'wrap' }, text(lang, 'serverEditorHint')),
    editor.error !== undefined && h(
      Box,
      { marginTop: 1, borderStyle: 'round', borderColor: 'error', paddingX: 1 },
      h(Text, { color: 'error', wrap: 'wrap' }, editor.error),
    ),
    h(Box, { height: 1 }),
    ...rows.map((item, index) => {
      const focused = index === editor.selected
      const key = item.kind === 'field'
        ? `field:${item.field}`
        : item.kind === 'boolean'
          ? `boolean:${item.field}`
          : item.kind === 'credential' ? `credential:${item.ref}` : item.kind
      const common = {
        key,
        flexDirection: 'row' as const,
        minHeight: 1,
        paddingX: 1,
        onClick: () => activateRow(index),
      }
      const marker = h(Text, { color: focused ? undefined : 'subtle' }, focused ? '❯ ' : '  ')
      if (item.kind === 'field') {
        const editing = editor.editing?.kind === 'field' && editor.editing.field === item.field
        const value = editor.draft[item.field]
        return h(
          Box,
          common,
          marker,
          h(Text, { color: 'permission' }, `${serverFieldLabel(lang, item.field)}: `),
          h(Text, { bold: focused, color: item.editable ? undefined : 'subtle', wrap: 'truncate-end' },
            `${value || text(lang, 'valueEmpty')}${editing ? '▍' : ''}`,
          ),
          h(Box, { flexGrow: 1 }),
          item.editable && h(Text, { color: 'subtle' }, text(lang, 'editValue')),
        )
      }
      if (item.kind === 'transport') {
        return h(
          Box,
          common,
          marker,
          h(Text, { color: 'permission' }, `${text(lang, 'transport')}: `),
          h(Text, { bold: focused }, editor.draft.transport),
          h(Box, { flexGrow: 1 }),
          h(Text, { color: 'subtle' }, text(lang, 'toggle')),
        )
      }
      if (item.kind === 'boolean') {
        const enabled = editor.draft[item.field]
        return h(
          Box,
          common,
          marker,
          h(Text, { color: 'permission' }, `${text(lang, item.field === 'failOnStartupError' ? 'failStartup' : 'reconnectEnabled')}: `),
          h(Text, { color: enabled ? 'success' : 'inactive', bold: focused }, text(lang, enabled ? 'enabled' : 'disabled')),
        )
      }
      if (item.kind === 'credential') {
        const editing = editor.editing?.kind === 'credential' && editor.editing.ref === item.ref
        const pending = editor.draft.credentialValues[item.ref]
        const status = pending !== undefined
          ? text(lang, 'credentialPending')
          : text(lang, isCredentialConfigured(snapshot, item.ref) ? 'credentialConfigured' : 'credentialMissing')
        return h(
          Box,
          common,
          marker,
          h(Text, { color: 'permission' }, `${text(lang, 'credentialValue')} ${item.ref}: `),
          h(Text, { color: pending !== undefined ? 'warning' : 'subtle', bold: focused },
            editing ? `${'•'.repeat(Math.min(12, pending?.length ?? 0))}▍` : status,
          ),
        )
      }
      return h(
        Box,
        common,
        marker,
        h(Text, { bold: focused, color: item.kind === 'save' ? 'success' : 'inactive' },
          `${item.kind === 'save' ? '✓' : '×'} ${text(lang, item.kind)}`,
        ),
      )
    }),
  )
}

import type { TuiSceneProps } from '@deepseek-harness-tui/dsh-tui/scenes'
import type { McpManagerService } from '../host/manager.js'
import type { McpManagerSnapshot, McpServerView } from '../host/types.js'
import {
  credentialRef,
  persistCredentialValues,
  type CredentialProviderFace,
} from './credential-provider.js'
import { sceneText as text, type SceneLanguage } from './scene-i18n.js'
import {
  clamp,
  removeLastCodePoint,
  type FocusArea,
  type ServerEditorRow,
  type ServerEditorState,
  type ServerTextField,
  type Workspace,
} from './scene-model.js'
import {
  buildServerSubmission,
  createServerDraft,
  credentialReferences,
  validateServerDraft,
  type ServerFormIssue,
  type ServerFormIntent,
} from './server-form-model.js'

type InputKey = Parameters<Parameters<TuiSceneProps['ui']['useInput']>[0]>[1]

interface ServerEditorControllerOptions {
  React: TuiSceneProps['React']
  manager: McpManagerService
  credentials?: CredentialProviderFace
  lang: SceneLanguage
  snapshot: McpManagerSnapshot | undefined
  selectedServer: McpServerView | undefined
  busy: string | undefined
  ensureWritable(): boolean
  mutate(
    action: () => Promise<McpManagerSnapshot>,
    pending: string,
    success: string,
  ): Promise<boolean>
  setWorkspace(workspace: Workspace): void
  setSelectedServerId(id: string): void
  setFocusArea(area: FocusArea): void
  scrollDetailBy(delta: number): void
  scrollDetailTo(offset: number): void
  isMounted(): boolean
}

function serverIssueText(language: SceneLanguage, issue: ServerFormIssue): string {
  const keys = {
    'invalid-id': 'invalidServerId',
    'duplicate-id': 'duplicateServerId',
    'invalid-server-name': 'invalidServerName',
    'duplicate-server-name': 'duplicateServerName',
    'invalid-command': 'invalidCommand',
    'invalid-url': 'invalidUrl',
    'invalid-pairs': 'invalidPairs',
    'plain-secret-env': 'plainSecretEnv',
    'invalid-credential-refs': 'invalidCredentialRefs',
    'plain-secret-headers': 'plainSecretHeaders',
    'invalid-secret-headers': 'invalidSecretHeaders',
    'invalid-positive-number': 'invalidPositiveNumber',
    'invalid-positive-integer': 'invalidPositiveInteger',
    'invalid-reconnect-delays': 'invalidReconnectDelays',
  } as const
  return text(language, keys[issue])
}

export function serverEditorRowsFor(editor: ServerEditorState | undefined): ServerEditorRow[] {
  if (editor === undefined) return []
  return [
    { kind: 'field', field: 'id', editable: editor.intent !== 'edit' },
    { kind: 'field', field: 'displayName', editable: true },
    { kind: 'field', field: 'serverName', editable: true },
    { kind: 'transport' },
    ...(editor.draft.transport === 'stdio'
      ? [
          { kind: 'field' as const, field: 'command' as const, editable: true },
          { kind: 'field' as const, field: 'args' as const, editable: true },
          { kind: 'field' as const, field: 'cwd' as const, editable: true },
          { kind: 'field' as const, field: 'env' as const, editable: true },
          { kind: 'field' as const, field: 'secretEnv' as const, editable: true },
        ]
      : [
          { kind: 'field' as const, field: 'url' as const, editable: true },
          { kind: 'field' as const, field: 'headers' as const, editable: true },
          { kind: 'field' as const, field: 'secretHeaders' as const, editable: true },
        ]),
    ...credentialReferences(editor.draft).map((ref) => ({ kind: 'credential' as const, ref })),
    { kind: 'field', field: 'toolCallTimeoutMs', editable: true },
    { kind: 'boolean', field: 'failOnStartupError' },
    { kind: 'boolean', field: 'reconnectEnabled' },
    { kind: 'field', field: 'reconnectInitialDelayMs', editable: true },
    { kind: 'field', field: 'reconnectMaxDelayMs', editable: true },
    { kind: 'field', field: 'reconnectMaxAttempts', editable: true },
    { kind: 'save' },
    { kind: 'cancel' },
  ]
}

export function useServerEditorController({
  React,
  manager,
  credentials,
  lang,
  snapshot,
  selectedServer,
  busy,
  ensureWritable,
  mutate,
  setWorkspace,
  setSelectedServerId,
  setFocusArea,
  scrollDetailBy,
  scrollDetailTo,
  isMounted,
}: ServerEditorControllerOptions) {
  const [editor, setEditor] = React.useState<ServerEditorState | undefined>()
  const rows = serverEditorRowsFor(editor)

  const open = (intent: ServerFormIntent): void => {
    if (snapshot === undefined || busy !== undefined || !ensureWritable()) return
    const existing = intent === 'create' ? undefined : selectedServer
    if (intent !== 'create' && existing === undefined) return
    setEditor({
      intent,
      ...(existing === undefined ? {} : { originalId: existing.id }),
      draft: createServerDraft(snapshot, intent, existing, lang),
      selected: 0,
    })
    setFocusArea('detail')
    scrollDetailTo(0)
  }

  const close = (): void => {
    setEditor(undefined)
  }

  const moveSelection = (delta: number): void => {
    setEditor((current: ServerEditorState | undefined) => {
      if (current === undefined) return current
      const selected = clamp(current.selected + delta, rows.length)
      scrollDetailTo(selected)
      return { ...current, selected, error: undefined }
    })
  }

  const save = async (current: ServerEditorState, index: number): Promise<void> => {
    if (snapshot === undefined || busy !== undefined) return
    const issue = validateServerDraft(current.draft, snapshot, current.intent, current.originalId)
    if (issue !== undefined) {
      setEditor({ ...current, selected: index, error: serverIssueText(lang, issue) })
      return
    }
    const refs = credentialReferences(current.draft)
    if (refs.length > 0 && credentials === undefined) {
      setEditor({ ...current, selected: index, error: text(lang, 'credentialUnavailable') })
      return
    }
    if (credentials !== undefined) {
      for (const ref of refs) {
        const info = await credentials.describe(credentialRef(ref)).catch(() => ({ configured: false, writable: false }))
        const pending = current.draft.credentialValues[ref]
        if (pending !== undefined && !info.writable) {
          setEditor({
            ...current,
            selected: index,
            error: text(lang, 'credentialReadOnly').replace('{ref}', ref),
          })
          return
        }
        if (pending === undefined && !info.configured) {
          setEditor({
            ...current,
            selected: index,
            error: text(lang, 'credentialRequired').replace('{ref}', ref),
          })
          return
        }
      }
    }
    const submission = buildServerSubmission(current.draft)
    const saved = await mutate(
      async () => {
        if (credentials !== undefined) await persistCredentialValues(credentials, submission.credentialValues)
        return manager.invoke('upsert', { server: submission.record })
      },
      text(lang, 'save'),
      text(lang, 'updated'),
    )
    if (!saved || !isMounted()) return
    setWorkspace('servers')
    setSelectedServerId(submission.record.id)
    setEditor(undefined)
  }

  const activateRow = (index: number): void => {
    if (editor === undefined || busy !== undefined) return
    const row = rows[index]
    if (row === undefined) return
    if (row.kind === 'field') {
      if (row.editable) {
        setEditor({
          ...editor,
          selected: index,
          editing: { kind: 'field', field: row.field },
          error: undefined,
        })
      }
      return
    }
    if (row.kind === 'credential') {
      setEditor({
        ...editor,
        selected: index,
        editing: { kind: 'credential', ref: row.ref },
        error: undefined,
      })
      return
    }
    if (row.kind === 'transport') {
      setEditor({
        ...editor,
        selected: index,
        error: undefined,
        draft: {
          ...editor.draft,
          transport: editor.draft.transport === 'stdio' ? 'streamable-http' : 'stdio',
        },
      })
      return
    }
    if (row.kind === 'boolean') {
      setEditor({
        ...editor,
        selected: index,
        error: undefined,
        draft: { ...editor.draft, [row.field]: !editor.draft[row.field] },
      })
      return
    }
    if (row.kind === 'cancel') {
      close()
      return
    }
    void save(editor, index)
  }

  const handleInput = (input: string, key: InputKey): boolean => {
    if (editor === undefined) return false
    const lower = input.toLowerCase()
    if (editor.editing !== undefined) {
      const editing = editor.editing
      if (key.escape) {
        close()
        return true
      }
      if (key.return) {
        if (editing.kind === 'credential' && editor.draft.credentialValues[editing.ref] === '') {
          const credentialValues = { ...editor.draft.credentialValues }
          delete credentialValues[editing.ref]
          setEditor({
            ...editor,
            editing: undefined,
            error: undefined,
            draft: { ...editor.draft, credentialValues },
          })
        } else {
          setEditor({ ...editor, editing: undefined, error: undefined })
        }
        return true
      }
      if (key.ctrl && lower === 'u') {
        if (editing.kind === 'field') {
          setEditor({
            ...editor,
            error: undefined,
            draft: { ...editor.draft, [editing.field]: '' },
          })
        } else {
          setEditor({
            ...editor,
            error: undefined,
            draft: {
              ...editor.draft,
              credentialValues: { ...editor.draft.credentialValues, [editing.ref]: '' },
            },
          })
        }
        return true
      }
      if (key.backspace) {
        if (editing.kind === 'field') {
          setEditor({
            ...editor,
            error: undefined,
            draft: {
              ...editor.draft,
              [editing.field]: removeLastCodePoint(editor.draft[editing.field]),
            },
          })
        } else {
          const value = editor.draft.credentialValues[editing.ref] ?? ''
          setEditor({
            ...editor,
            error: undefined,
            draft: {
              ...editor.draft,
              credentialValues: {
                ...editor.draft.credentialValues,
                [editing.ref]: removeLastCodePoint(value),
              },
            },
          })
        }
        return true
      }
      if (!key.ctrl && !key.meta && !key.super) {
        const printable = input.replace(/[\u0000-\u001f\u007f]/g, '')
        if (printable !== '') {
          if (editing.kind === 'field') {
            const field: ServerTextField = editing.field
            const limits: Partial<Record<ServerTextField, number>> = {
              id: 64,
              displayName: 80,
              serverName: 32,
              toolCallTimeoutMs: 16,
              reconnectInitialDelayMs: 16,
              reconnectMaxDelayMs: 16,
              reconnectMaxAttempts: 16,
            }
            const limit = limits[field] ?? 4096
            const value = Array.from(`${editor.draft[field]}${printable}`).slice(0, limit).join('')
            setEditor({
              ...editor,
              error: undefined,
              draft: { ...editor.draft, [field]: value },
            })
          } else {
            const current = editor.draft.credentialValues[editing.ref] ?? ''
            const value = Array.from(`${current}${printable}`).slice(0, 8192).join('')
            setEditor({
              ...editor,
              error: undefined,
              draft: {
                ...editor.draft,
                credentialValues: { ...editor.draft.credentialValues, [editing.ref]: value },
              },
            })
          }
        }
      }
      return true
    }
    if (key.escape) close()
    else if (key.upArrow) moveSelection(-1)
    else if (key.downArrow) moveSelection(1)
    else if (key.return) activateRow(editor.selected)
    else if (key.pageUp || key.pageDown || key.wheelUp || key.wheelDown) {
      scrollDetailBy(key.pageUp || key.wheelUp ? -5 : 5)
    }
    return true
  }

  return {
    editor,
    rows,
    open,
    activateRow,
    handleInput,
  }
}

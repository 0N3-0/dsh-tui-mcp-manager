import type { TuiSceneProps } from '@deepseek-harness-tui/dsh-tui/scenes'
import type { McpManagerService } from '../host/manager.js'
import { credentialRef, persistCredentialValues, type CredentialProviderFace } from './credential-provider.js'
import type {
  ManagedSetRecord,
  McpDoctorReport,
  McpManagerSnapshot,
  McpServerView,
  McpSetView,
} from '../host/types.js'
import { sceneText as text, type SceneLanguage } from './scene-i18n.js'
import {
  buildServerSubmission,
  createServerDraft,
  credentialReferences,
  validateServerDraft,
  type ServerFormIssue,
  type ServerFormIntent,
} from './server-form-model.js'
import {
  SCENE_POLL_MS,
  TABS,
  WORKSPACES,
  clamp,
  nextSetId,
  removeLastCodePoint,
  type ConfirmAction,
  type FocusArea,
  type NavItem,
  type SceneTab,
  type ServerEditorRow,
  type ServerEditorState,
  type ServerTextField,
  type SetEditorRow,
  type SetEditorState,
  type Workspace,
} from './scene-model.js'

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

/**
 * Own every mutable Scene concern without rendering any terminal elements.
 * Keeping this hook host-React-only prevents invalid hook calls while making
 * the view layer small enough for server forms to be migrated independently.
 */
export function useMcpManagerSceneController(
  props: TuiSceneProps,
  manager: McpManagerService,
  resolveLanguage: () => Promise<SceneLanguage>,
  credentials?: CredentialProviderFace,
) {
  const { React, ui, close } = props
  const { useInput } = ui
  const [lang, setLang] = React.useState<SceneLanguage>('zh')
  const [snapshot, setSnapshot] = React.useState<McpManagerSnapshot | undefined>()
  const [workspace, setWorkspace] = React.useState<Workspace>('sets')
  const [focusArea, setFocusArea] = React.useState<FocusArea>('navigation')
  const [selectedServerId, setSelectedServerId] = React.useState<string>('')
  const [selectedSetId, setSelectedSetId] = React.useState<string>('')
  const [tab, setTab] = React.useState<SceneTab>('overview')
  const [detailActionIndex, setDetailActionIndex] = React.useState(0)
  const [toolIndex, setToolIndex] = React.useState(0)
  const [toolDetailOpen, setToolDetailOpen] = React.useState(false)
  const [doctor, setDoctor] = React.useState<McpDoctorReport | undefined>()
  const [busy, setBusy] = React.useState<string | undefined>()
  const [notice, setNotice] = React.useState<string | undefined>()
  const [error, setError] = React.useState<string | undefined>()
  const [confirm, setConfirm] = React.useState<ConfirmAction | undefined>()
  const [setEditor, setSetEditor] = React.useState<SetEditorState | undefined>()
  const [serverEditor, setServerEditor] = React.useState<ServerEditorState | undefined>()
  const [detailScrollTop, setDetailScrollTop] = React.useState(0)
  const mounted = React.useRef(true)
  const doctorRequest = React.useRef(0)

  const scrollDetailBy = (delta: number): void => {
    setDetailScrollTop((current: number) => Math.max(0, current + Math.trunc(delta)))
  }

  const scrollDetailTo = (next: number): void => {
    setDetailScrollTop(Math.max(0, Math.trunc(next)))
  }

  const load = React.useCallback(async (announce = false): Promise<void> => {
    try {
      const next = await manager.invoke('list', {})
      if (!mounted.current) return
      setSnapshot(next)
      setError(undefined)
      if (announce) setNotice(text(lang, 'refreshed'))
    } catch (cause) {
      if (mounted.current) setError(cause instanceof Error ? cause.message : String(cause))
    }
  }, [lang])

  React.useEffect(() => {
    mounted.current = true
    void resolveLanguage().then((next) => {
      if (mounted.current) setLang(next)
    })
    let pollTimer: ReturnType<typeof setTimeout> | undefined
    let stopped = false
    let loading = false
    let refreshAgain = false
    const refresh = async (): Promise<void> => {
      if (loading) {
        refreshAgain = true
        return
      }
      loading = true
      do {
        refreshAgain = false
        await load()
      } while (!stopped && refreshAgain)
      loading = false
    }
    const poll = async (): Promise<void> => {
      await refresh()
      if (!stopped) pollTimer = setTimeout(() => void poll(), SCENE_POLL_MS)
    }
    const unsubscribe = manager.subscribe(() => void refresh())
    void poll()
    return () => {
      stopped = true
      mounted.current = false
      unsubscribe()
      if (pollTimer !== undefined) clearTimeout(pollTimer)
    }
  }, [load])

  const navItems: NavItem[] = snapshot === undefined
    ? []
    : workspace === 'servers'
      ? snapshot.servers.map((server: McpServerView) => ({ kind: 'server' as const, key: `server:${server.id}`, server }))
      : snapshot.sets.map((set: McpSetView) => ({ kind: 'set' as const, key: `set:${set.id}`, set }))
  const selectedKey = workspace === 'servers' ? `server:${selectedServerId}` : `set:${selectedSetId}`
  const selectedIndex = Math.max(0, navItems.findIndex((item) => item.key === selectedKey))
  const selected = navItems[selectedIndex]
  const selectedServer = selected?.kind === 'server' ? selected.server : undefined
  const selectedSet = selected?.kind === 'set' ? selected.set : undefined
  const activeToolDetailIndex = toolDetailOpen ? toolIndex : -1

  const runDoctorFor = React.useCallback((serverId: string): void => {
    const request = ++doctorRequest.current
    setDoctor(undefined)
    setBusy(text(lang, 'doctorRunning'))
    setError(undefined)
    void manager.doctor(serverId).then((report) => {
      if (mounted.current && doctorRequest.current === request) setDoctor(report)
    }).catch((cause: unknown) => {
      if (mounted.current && doctorRequest.current === request) {
        setError(cause instanceof Error ? cause.message : String(cause))
      }
    }).finally(() => {
      if (mounted.current && doctorRequest.current === request) setBusy(undefined)
    })
  }, [lang])

  React.useEffect(() => {
    const servers = snapshot?.servers ?? []
    if (servers.length === 0) {
      if (selectedServerId !== '') setSelectedServerId('')
    } else if (!servers.some((server: McpServerView) => server.id === selectedServerId)) {
      setSelectedServerId(servers[0]!.id)
    }
  }, [selectedServerId, snapshot?.servers.map((server: McpServerView) => server.id).join('|')])

  React.useEffect(() => {
    const sets = snapshot?.sets ?? []
    if (sets.length === 0) {
      if (selectedSetId !== '') setSelectedSetId('')
    } else if (!sets.some((set: McpSetView) => set.id === selectedSetId)) {
      setSelectedSetId(sets[0]!.id)
    }
  }, [selectedSetId, snapshot?.sets.map((set: McpSetView) => set.id).join('|')])

  React.useEffect(() => {
    setDoctor(undefined)
    setDetailActionIndex(0)
    setToolIndex(0)
    setToolDetailOpen(false)
    scrollDetailTo(0)
    if (selected?.kind === 'set') setTab('overview')
  }, [selected?.key])

  React.useEffect(() => {
    setDetailActionIndex(0)
    setToolDetailOpen(false)
    scrollDetailTo(0)
  }, [tab])

  React.useEffect(() => {
    scrollDetailTo(0)
  }, [selected?.key, tab, toolDetailOpen, activeToolDetailIndex])

  React.useEffect(() => {
    if (tab === 'doctor' && selectedServer !== undefined) runDoctorFor(selectedServer.id)
  }, [runDoctorFor, selectedServer?.id, tab])

  const mutate = async (
    action: () => Promise<McpManagerSnapshot>,
    pending: string,
    success: string,
  ): Promise<boolean> => {
    if (busy !== undefined) return false
    setBusy(pending)
    setNotice(undefined)
    setError(undefined)
    try {
      const next = await action()
      if (!mounted.current) return false
      setSnapshot(next)
      setNotice(success)
      return true
    } catch (cause) {
      if (mounted.current) setError(cause instanceof Error ? cause.message : String(cause))
      return false
    } finally {
      if (mounted.current) setBusy(undefined)
    }
  }

  const ensureWritable = (): boolean => {
    if (snapshot?.storage.writable) return true
    setError(text(lang, 'readOnlyError'))
    return false
  }

  const toggleSelected = (): void => {
    if (selectedSet === undefined || !ensureWritable()) return
    void mutate(
      () => manager.invoke('toggleSet', { id: selectedSet.id, enabled: !selectedSet.active }),
      text(lang, 'updated'),
      text(lang, 'updated'),
    )
  }

  const reconnectSelected = (): void => {
    if (selectedServer === undefined || !selectedServer.enabled) return
    void mutate(
      () => manager.invoke('reconnect', { id: selectedServer.id }),
      text(lang, 'reconnect'),
      text(lang, 'reconnected'),
    )
  }

  const runDoctor = (): void => {
    if (selectedServer === undefined || busy !== undefined) return
    setFocusArea('detail')
    if (tab === 'doctor') runDoctorFor(selectedServer.id)
    else setTab('doctor')
  }

  const confirmRemoval = (): void => {
    if (!ensureWritable()) return
    if (selectedServer !== undefined) {
      setConfirm({ kind: 'remove-server', id: selectedServer.id, label: selectedServer.name })
    } else if (selectedSet !== undefined) {
      setConfirm({ kind: 'remove-set', id: selectedSet.id, label: selectedSet.name })
    }
  }

  const removeConfirmed = (): void => {
    if (confirm === undefined) return
    const action = confirm
    setConfirm(undefined)
    void mutate(
      () => action.kind === 'remove-server'
        ? manager.invoke('remove', { id: action.id })
        : manager.invoke('removeSet', { id: action.id }),
      text(lang, 'remove'),
      text(lang, 'removed'),
    )
  }

  const cancelRemoval = (): void => {
    setConfirm(undefined)
  }

  const selectNavItem = (item: NavItem): void => {
    setFocusArea('navigation')
    scrollDetailTo(0)
    if (item.kind === 'server') setSelectedServerId(item.server.id)
    else setSelectedSetId(item.set.id)
  }

  const selectWorkspace = (next: Workspace): void => {
    setWorkspace(next)
    setFocusArea('navigation')
    setToolDetailOpen(false)
    scrollDetailTo(0)
  }

  const selectTab = (next: SceneTab): void => {
    setTab(next)
    setFocusArea('detail')
    setToolDetailOpen(false)
    scrollDetailTo(0)
  }

  const openTool = (index: number): void => {
    setToolIndex(index)
    setFocusArea('detail')
    setToolDetailOpen(true)
    scrollDetailTo(0)
  }

  const moveToolSelection = (delta: number): void => {
    if (selectedServer === undefined || selectedServer.tools.length === 0) return
    const next = clamp(toolIndex + delta, selectedServer.tools.length)
    setToolIndex(next)
  }

  const setEditorRows: SetEditorRow[] = setEditor === undefined
    ? []
    : [
        { kind: 'field', field: 'id', editable: setEditor.mode === 'create' },
        { kind: 'field', field: 'name', editable: true },
        ...(snapshot?.servers ?? []).map((server: McpServerView) => ({ kind: 'member' as const, server })),
        { kind: 'save' },
        { kind: 'cancel' },
      ]

  const openCreateSet = (): void => {
    if (snapshot === undefined || busy !== undefined || !ensureWritable()) return
    setSetEditor({
      mode: 'create',
      draft: { id: nextSetId(snapshot), name: '', serverIds: [] },
      selected: 0,
    })
    setFocusArea('detail')
    scrollDetailTo(0)
  }

  const openEditSet = (): void => {
    if (selectedSet === undefined || busy !== undefined || !ensureWritable()) return
    setSetEditor({
      mode: 'edit',
      draft: { id: selectedSet.id, name: selectedSet.name, serverIds: [...selectedSet.serverIds] },
      selected: 1,
    })
    setFocusArea('detail')
    scrollDetailTo(0)
  }

  const moveSetEditorSelection = (delta: number): void => {
    setSetEditor((current: SetEditorState | undefined) => {
      if (current === undefined) return current
      const selected = clamp(current.selected + delta, setEditorRows.length)
      scrollDetailTo(selected)
      return { ...current, selected, error: undefined }
    })
  }

  const activateSetEditorRow = (index: number): void => {
    if (setEditor === undefined || busy !== undefined) return
    const row = setEditorRows[index]
    if (row === undefined) return
    if (row.kind === 'field') {
      if (row.editable) setSetEditor({ ...setEditor, selected: index, editing: row.field, error: undefined })
      return
    }
    if (row.kind === 'member') {
      const members = new Set(setEditor.draft.serverIds)
      if (members.has(row.server.id)) members.delete(row.server.id)
      else members.add(row.server.id)
      setSetEditor({
        ...setEditor,
        selected: index,
        error: undefined,
        draft: { ...setEditor.draft, serverIds: [...members] },
      })
      return
    }
    if (row.kind === 'cancel') {
      setSetEditor(undefined)
      return
    }
    const record: ManagedSetRecord = {
      id: setEditor.draft.id.trim(),
      name: setEditor.draft.name.trim(),
      serverIds: [...setEditor.draft.serverIds],
    }
    if (!/^[a-z0-9][a-z0-9._-]{0,63}$/.test(record.id)) {
      setSetEditor({ ...setEditor, selected: index, error: text(lang, 'invalidSetId') })
      return
    }
    if (setEditor.mode === 'create' && snapshot?.sets.some((set: McpSetView) => set.id === record.id)) {
      setSetEditor({ ...setEditor, selected: index, error: text(lang, 'duplicateSetId') })
      return
    }
    if (record.name.length === 0 || Array.from(record.name).length > 80) {
      setSetEditor({ ...setEditor, selected: index, error: text(lang, 'invalidSetName') })
      return
    }
    void mutate(
      () => manager.invoke('upsertSet', { set: record }),
      text(lang, 'save'),
      text(lang, 'updated'),
    ).then((saved) => {
      if (!saved || !mounted.current) return
      setSelectedSetId(record.id)
      setSetEditor(undefined)
    })
  }

  const serverEditorRows: ServerEditorRow[] = serverEditor === undefined
    ? []
    : [
        { kind: 'field', field: 'id', editable: serverEditor.intent !== 'edit' },
        { kind: 'field', field: 'displayName', editable: true },
        { kind: 'field', field: 'serverName', editable: true },
        { kind: 'transport' },
        ...(serverEditor.draft.transport === 'stdio'
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
        ...credentialReferences(serverEditor.draft).map((ref) => ({ kind: 'credential' as const, ref })),
        { kind: 'field', field: 'toolCallTimeoutMs', editable: true },
        { kind: 'boolean', field: 'failOnStartupError' },
        { kind: 'boolean', field: 'reconnectEnabled' },
        { kind: 'field', field: 'reconnectInitialDelayMs', editable: true },
        { kind: 'field', field: 'reconnectMaxDelayMs', editable: true },
        { kind: 'field', field: 'reconnectMaxAttempts', editable: true },
        { kind: 'save' },
        { kind: 'cancel' },
      ]

  const openServerEditor = (intent: ServerFormIntent): void => {
    if (snapshot === undefined || busy !== undefined || !ensureWritable()) return
    const existing = intent === 'create' ? undefined : selectedServer
    if (intent !== 'create' && existing === undefined) return
    setServerEditor({
      intent,
      ...(existing === undefined ? {} : { originalId: existing.id }),
      draft: createServerDraft(snapshot, intent, existing, lang),
      selected: 0,
    })
    setFocusArea('detail')
    scrollDetailTo(0)
  }

  const closeServerEditor = (): void => {
    setServerEditor(undefined)
  }

  const moveServerEditorSelection = (delta: number): void => {
    setServerEditor((current: ServerEditorState | undefined) => {
      if (current === undefined) return current
      const selected = clamp(current.selected + delta, serverEditorRows.length)
      scrollDetailTo(selected)
      return { ...current, selected, error: undefined }
    })
  }

  const saveServerEditor = async (editor: ServerEditorState, index: number): Promise<void> => {
    if (snapshot === undefined || busy !== undefined) return
    const issue = validateServerDraft(editor.draft, snapshot, editor.intent, editor.originalId)
    if (issue !== undefined) {
      setServerEditor({ ...editor, selected: index, error: serverIssueText(lang, issue) })
      return
    }
    const refs = credentialReferences(editor.draft)
    if (refs.length > 0 && credentials === undefined) {
      setServerEditor({ ...editor, selected: index, error: text(lang, 'credentialUnavailable') })
      return
    }
    if (credentials !== undefined) {
      for (const ref of refs) {
        const info = await credentials.describe(credentialRef(ref)).catch(() => ({ configured: false, writable: false }))
        const pending = editor.draft.credentialValues[ref]
        if (pending !== undefined && !info.writable) {
          setServerEditor({
            ...editor,
            selected: index,
            error: text(lang, 'credentialReadOnly').replace('{ref}', ref),
          })
          return
        }
        if (pending === undefined && !info.configured) {
          setServerEditor({
            ...editor,
            selected: index,
            error: text(lang, 'credentialRequired').replace('{ref}', ref),
          })
          return
        }
      }
    }
    const submission = buildServerSubmission(editor.draft)
    const saved = await mutate(
      async () => {
        if (credentials !== undefined) await persistCredentialValues(credentials, submission.credentialValues)
        return manager.invoke('upsert', { server: submission.record })
      },
      text(lang, 'save'),
      text(lang, 'updated'),
    )
    if (!saved || !mounted.current) return
    setWorkspace('servers')
    setSelectedServerId(submission.record.id)
    setServerEditor(undefined)
  }

  const activateServerEditorRow = (index: number): void => {
    if (serverEditor === undefined || busy !== undefined) return
    const row = serverEditorRows[index]
    if (row === undefined) return
    if (row.kind === 'field') {
      if (row.editable) {
        setServerEditor({
          ...serverEditor,
          selected: index,
          editing: { kind: 'field', field: row.field },
          error: undefined,
        })
      }
      return
    }
    if (row.kind === 'credential') {
      setServerEditor({
        ...serverEditor,
        selected: index,
        editing: { kind: 'credential', ref: row.ref },
        error: undefined,
      })
      return
    }
    if (row.kind === 'transport') {
      setServerEditor({
        ...serverEditor,
        selected: index,
        error: undefined,
        draft: {
          ...serverEditor.draft,
          transport: serverEditor.draft.transport === 'stdio' ? 'streamable-http' : 'stdio',
        },
      })
      return
    }
    if (row.kind === 'boolean') {
      setServerEditor({
        ...serverEditor,
        selected: index,
        error: undefined,
        draft: { ...serverEditor.draft, [row.field]: !serverEditor.draft[row.field] },
      })
      return
    }
    if (row.kind === 'cancel') {
      closeServerEditor()
      return
    }
    void saveServerEditor(serverEditor, index)
  }

  const detailActionCount = setEditor !== undefined || serverEditor !== undefined
    ? 0
    : selectedSet !== undefined
      ? 3
      : selectedServer !== undefined && tab === 'overview' ? 5 : 0

  const moveDetailAction = (delta: number): void => {
    if (detailActionCount === 0) return
    setDetailActionIndex((current: number) => clamp(current + delta, detailActionCount))
  }

  const activateDetailAction = (index = detailActionIndex): void => {
    if (detailActionCount === 0) return
    const next = clamp(index, detailActionCount)
    setFocusArea('detail')
    setDetailActionIndex(next)
    if (selectedSet !== undefined) {
      if (next === 0) toggleSelected()
      else if (next === 1) openEditSet()
      else confirmRemoval()
      return
    }
    if (selectedServer === undefined || tab !== 'overview') return
    if (next === 0) openServerEditor('edit')
    else if (next === 1) openServerEditor('duplicate')
    else if (next === 2) reconnectSelected()
    else if (next === 3) runDoctor()
    else confirmRemoval()
  }

  useInput((input, key, event) => {
    const lower = input.toLowerCase()
    if (key.ctrl && lower === 'c') return
    event.stopImmediatePropagation()
    if (confirm !== undefined) {
      if (key.return) removeConfirmed()
      else if (key.escape) cancelRemoval()
      return
    }
    if (serverEditor !== undefined) {
      if (serverEditor.editing !== undefined) {
        const editing = serverEditor.editing
        if (key.escape) {
          closeServerEditor()
          return
        }
        if (key.return) {
          if (editing.kind === 'credential' && serverEditor.draft.credentialValues[editing.ref] === '') {
            const credentialValues = { ...serverEditor.draft.credentialValues }
            delete credentialValues[editing.ref]
            setServerEditor({
              ...serverEditor,
              editing: undefined,
              error: undefined,
              draft: { ...serverEditor.draft, credentialValues },
            })
          } else {
            setServerEditor({ ...serverEditor, editing: undefined, error: undefined })
          }
          return
        }
        if (key.ctrl && lower === 'u') {
          if (editing.kind === 'field') {
            setServerEditor({
              ...serverEditor,
              error: undefined,
              draft: { ...serverEditor.draft, [editing.field]: '' },
            })
          } else {
            setServerEditor({
              ...serverEditor,
              error: undefined,
              draft: {
                ...serverEditor.draft,
                credentialValues: { ...serverEditor.draft.credentialValues, [editing.ref]: '' },
              },
            })
          }
          return
        }
        if (key.backspace) {
          if (editing.kind === 'field') {
            setServerEditor({
              ...serverEditor,
              error: undefined,
              draft: {
                ...serverEditor.draft,
                [editing.field]: removeLastCodePoint(serverEditor.draft[editing.field]),
              },
            })
          } else {
            const value = serverEditor.draft.credentialValues[editing.ref] ?? ''
            setServerEditor({
              ...serverEditor,
              error: undefined,
              draft: {
                ...serverEditor.draft,
                credentialValues: {
                  ...serverEditor.draft.credentialValues,
                  [editing.ref]: removeLastCodePoint(value),
                },
              },
            })
          }
          return
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
              const value = Array.from(`${serverEditor.draft[field]}${printable}`).slice(0, limit).join('')
              setServerEditor({
                ...serverEditor,
                error: undefined,
                draft: { ...serverEditor.draft, [field]: value },
              })
            } else {
              const current = serverEditor.draft.credentialValues[editing.ref] ?? ''
              const value = Array.from(`${current}${printable}`).slice(0, 8192).join('')
              setServerEditor({
                ...serverEditor,
                error: undefined,
                draft: {
                  ...serverEditor.draft,
                  credentialValues: { ...serverEditor.draft.credentialValues, [editing.ref]: value },
                },
              })
            }
          }
        }
        return
      }
      if (key.escape) {
        closeServerEditor()
        return
      }
      if (key.upArrow) {
        moveServerEditorSelection(-1)
        return
      }
      if (key.downArrow) {
        moveServerEditorSelection(1)
        return
      }
      if (key.return) {
        activateServerEditorRow(serverEditor.selected)
        return
      }
      if (key.pageUp || key.pageDown || key.wheelUp || key.wheelDown) {
        scrollDetailBy(key.pageUp || key.wheelUp ? -5 : 5)
      }
      return
    }
    if (setEditor !== undefined) {
      if (setEditor.editing !== undefined) {
        if (key.escape) {
          setSetEditor(undefined)
          return
        }
        if (key.return) {
          setSetEditor({ ...setEditor, editing: undefined, error: undefined })
          return
        }
        if (key.backspace) {
          const field = setEditor.editing
          setSetEditor({
            ...setEditor,
            error: undefined,
            draft: { ...setEditor.draft, [field]: removeLastCodePoint(setEditor.draft[field]) },
          })
          return
        }
        if (!key.ctrl && !key.meta && !key.super) {
          const printable = input.replace(/[\u0000-\u001f\u007f]/g, '')
          if (printable !== '') {
            const field = setEditor.editing
            const limit = field === 'id' ? 64 : 80
            const value = Array.from(`${setEditor.draft[field]}${printable}`).slice(0, limit).join('')
            setSetEditor({
              ...setEditor,
              error: undefined,
              draft: { ...setEditor.draft, [field]: value },
            })
          }
        }
        return
      }
      if (key.escape) {
        setSetEditor(undefined)
        return
      }
      if (key.upArrow) {
        moveSetEditorSelection(-1)
        return
      }
      if (key.downArrow) {
        moveSetEditorSelection(1)
        return
      }
      if (key.return) {
        activateSetEditorRow(setEditor.selected)
        return
      }
      if (key.pageUp || key.pageDown || key.wheelUp || key.wheelDown) {
        scrollDetailBy(key.pageUp || key.wheelUp ? -5 : 5)
      }
      return
    }
    if (tab === 'tools' && selectedServer !== undefined && toolDetailOpen && key.escape) {
      setToolDetailOpen(false)
      scrollDetailTo(0)
      return
    }
    if (key.escape) {
      if (focusArea === 'detail') setFocusArea('navigation')
      else close()
      return
    }
    if (key.ctrl || key.meta || key.super) return
    if (key.tab) {
      setFocusArea(focusArea === 'navigation' ? 'detail' : 'navigation')
      return
    }
    if (lower === 'w') {
      selectWorkspace(WORKSPACES[(WORKSPACES.indexOf(workspace) + 1) % WORKSPACES.length]!)
      return
    }
    if (key.wheelUp || key.wheelDown) {
      scrollDetailBy(key.wheelUp ? -3 : 3)
      return
    }
    if (key.pageUp || key.pageDown) {
      scrollDetailBy(key.pageUp ? -10 : 10)
      return
    }

    if (focusArea === 'navigation') {
      if (key.upArrow) {
        const next = clamp(selectedIndex - 1, navItems.length)
        if (navItems[next] !== undefined) selectNavItem(navItems[next]!)
        return
      }
      if (key.downArrow) {
        const next = clamp(selectedIndex + 1, navItems.length)
        if (navItems[next] !== undefined) selectNavItem(navItems[next]!)
        return
      }
      if (key.return && selected !== undefined) {
        setFocusArea('detail')
        return
      }
    } else if (detailActionCount > 0) {
      if (key.upArrow) {
        moveDetailAction(-1)
        return
      }
      if (key.downArrow) {
        moveDetailAction(1)
        return
      }
      if (key.return) {
        activateDetailAction()
        return
      }
      if (selectedServer !== undefined && (key.leftArrow || key.rightArrow)) {
        const current = TABS.indexOf(tab)
        const direction = key.leftArrow ? -1 : 1
        selectTab(TABS[(current + direction + TABS.length) % TABS.length]!)
        return
      }
    } else if (selectedServer !== undefined) {
      if (key.leftArrow || key.rightArrow) {
        const current = TABS.indexOf(tab)
        const direction = key.leftArrow ? -1 : 1
        selectTab(TABS[(current + direction + TABS.length) % TABS.length]!)
        return
      }
      if (tab === 'tools' && toolDetailOpen && key.downArrow) {
        openTool(clamp(toolIndex + 1, selectedServer.tools.length))
        return
      }
      if (tab === 'tools' && toolDetailOpen && key.upArrow) {
        openTool(clamp(toolIndex - 1, selectedServer.tools.length))
        return
      }
      if (tab === 'tools' && !toolDetailOpen && key.upArrow) {
        moveToolSelection(-1)
        return
      }
      if (tab === 'tools' && !toolDetailOpen && key.downArrow) {
        moveToolSelection(1)
        return
      }
      if (tab === 'tools' && !toolDetailOpen && key.return && selectedServer.tools.length > 0) {
        openTool(clamp(toolIndex, selectedServer.tools.length))
        return
      }
      if (key.upArrow) {
        scrollDetailBy(-1)
        return
      }
      if (key.downArrow) {
        scrollDetailBy(1)
        return
      }
    } else if (focusArea === 'detail') {
      if (key.upArrow) {
        scrollDetailBy(-1)
        return
      }
      if (key.downArrow) {
        scrollDetailBy(1)
        return
      }
    }
    if (lower === 'a' && workspace === 'sets') openCreateSet()
    else if (lower === 'a' && workspace === 'servers') openServerEditor('create')
    else if (lower === 'r') void load(true)
  })

  return {
    lang,
    snapshot,
    workspace,
    focusArea,
    selectedIndex,
    navItems,
    selected,
    selectedServer,
    selectedSet,
    tab,
    detailActionIndex,
    toolIndex,
    toolDetailOpen,
    doctor,
    busy,
    notice,
    error,
    confirm,
    setEditor,
    setEditorRows,
    serverEditor,
    serverEditorRows,
    detailScrollTop,
    scrollDetailBy,
    scrollDetailTo,
    setFocusArea,
    setToolDetailOpen,
    selectNavItem,
    selectWorkspace,
    selectTab,
    openTool,
    activateDetailAction,
    toggleSelected,
    confirmRemoval,
    removeConfirmed,
    cancelRemoval,
    openCreateSet,
    openEditSet,
    activateSetEditorRow,
    openServerEditor,
    activateServerEditorRow,
  }
}

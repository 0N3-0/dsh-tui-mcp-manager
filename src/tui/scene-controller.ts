import type { TuiSceneProps } from '@deepseek-harness-tui/dsh-tui/scenes'
import type { McpManagerService } from '../host/manager.js'
import type { CredentialProviderFace } from './credential-provider.js'
import type {
  McpDoctorReport,
  McpManagerSnapshot,
  McpServerView,
  McpSetView,
} from '../host/types.js'
import { sceneText as text, type SceneLanguage } from './scene-i18n.js'
import { useServerEditorController } from './scene-server-editor-controller.js'
import { useSetEditorController } from './scene-set-editor-controller.js'
import {
  SCENE_POLL_MS,
  TABS,
  WORKSPACES,
  clamp,
  type ConfirmAction,
  type FocusArea,
  type NavItem,
  type SceneTab,
  type Workspace,
} from './scene-model.js'

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
  const [detailScrollTop, setDetailScrollTop] = React.useState(0)
  const mounted = React.useRef(true)
  const doctorRequest = React.useRef(0)

  const scrollDetailBy = (delta: number): void => {
    setDetailScrollTop((current: number) => Math.max(0, current + Math.trunc(delta)))
  }

  const scrollDetailTo = (next: number): void => {
    setDetailScrollTop(Math.max(0, Math.trunc(next)))
  }

  const load = React.useCallback(async (announcement?: string): Promise<void> => {
    try {
      const next = await manager.invoke('list', {})
      if (!mounted.current) return
      setSnapshot(next)
      setError(undefined)
      if (announcement !== undefined) setNotice(announcement)
    } catch (cause) {
      if (mounted.current) setError(cause instanceof Error ? cause.message : String(cause))
    }
  }, [manager])

  React.useEffect(() => {
    mounted.current = true
    void resolveLanguage().then((next) => {
      if (mounted.current) setLang(next)
    })
    let pollTimer: ReturnType<typeof setTimeout> | undefined
    let stopped = false
    let loading = false
    let refreshAgain = false
    let unsubscribe: (() => void) | undefined
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
    const start = async (): Promise<void> => {
      // Initialization updates manager records and emits change notifications.
      // Subscribe after the authoritative first snapshot so those changes do
      // not schedule an identical second profile read on Scene open.
      await refresh()
      if (stopped) return
      unsubscribe = manager.subscribe(() => void refresh())
      pollTimer = setTimeout(() => void poll(), SCENE_POLL_MS)
    }
    void start()
    return () => {
      stopped = true
      mounted.current = false
      unsubscribe?.()
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

  const {
    editor: serverEditor,
    rows: serverEditorRows,
    open: openServerEditor,
    activateRow: activateServerEditorRow,
    handleInput: handleServerEditorInput,
  } = useServerEditorController({
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
    isMounted: () => mounted.current,
  })

  const {
    editor: setEditor,
    rows: setEditorRows,
    openCreate: openCreateSet,
    openEdit: openEditSet,
    activateRow: activateSetEditorRow,
    handleInput: handleSetEditorInput,
  } = useSetEditorController({
    React,
    manager,
    lang,
    snapshot,
    selectedSet,
    busy,
    ensureWritable,
    mutate,
    setSelectedSetId,
    setFocusArea,
    scrollDetailBy,
    scrollDetailTo,
    isMounted: () => mounted.current,
  })

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

  const moveWorkspace = (): void => {
    setWorkspace((current: Workspace) => (
      WORKSPACES[(WORKSPACES.indexOf(current) + 1) % WORKSPACES.length]!
    ))
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

  const moveTab = (delta: number): void => {
    setTab((current: SceneTab) => {
      const index = TABS.indexOf(current)
      return TABS[(index + delta + TABS.length) % TABS.length]!
    })
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
    setToolIndex((current: number) => clamp(current + delta, selectedServer.tools.length))
  }

  const moveOpenTool = (delta: number): void => {
    if (selectedServer === undefined || selectedServer.tools.length === 0) return
    setToolIndex((current: number) => clamp(current + delta, selectedServer.tools.length))
    setFocusArea('detail')
    setToolDetailOpen(true)
    scrollDetailTo(0)
  }

  const moveNavSelection = (delta: number): void => {
    if (navItems.length === 0) return
    setFocusArea('navigation')
    scrollDetailTo(0)
    if (workspace === 'servers') {
      setSelectedServerId((current: string) => {
        const index = navItems.findIndex((item) => item.kind === 'server' && item.server.id === current)
        const next = navItems[clamp((index < 0 ? 0 : index) + delta, navItems.length)]
        return next?.kind === 'server' ? next.server.id : current
      })
      return
    }
    setSelectedSetId((current: string) => {
      const index = navItems.findIndex((item) => item.kind === 'set' && item.set.id === current)
      const next = navItems[clamp((index < 0 ? 0 : index) + delta, navItems.length)]
      return next?.kind === 'set' ? next.set.id : current
    })
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
    if (handleServerEditorInput(input, key)) return
    if (handleSetEditorInput(input, key)) return
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
      setFocusArea((current: FocusArea) => current === 'navigation' ? 'detail' : 'navigation')
      return
    }
    if (lower === 'w') {
      moveWorkspace()
      return
    }
    if (focusArea === 'detail' && (key.wheelUp || key.wheelDown)) {
      scrollDetailBy(key.wheelUp ? -3 : 3)
      return
    }
    if (focusArea === 'detail' && (key.pageUp || key.pageDown)) {
      scrollDetailBy(key.pageUp ? -10 : 10)
      return
    }

    if (focusArea === 'navigation') {
      if (key.upArrow) {
        moveNavSelection(-1)
        return
      }
      if (key.downArrow) {
        moveNavSelection(1)
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
        moveTab(key.leftArrow ? -1 : 1)
        return
      }
    } else if (selectedServer !== undefined) {
      if (key.leftArrow || key.rightArrow) {
        moveTab(key.leftArrow ? -1 : 1)
        return
      }
      if (tab === 'tools' && toolDetailOpen && key.downArrow) {
        moveOpenTool(1)
        return
      }
      if (tab === 'tools' && toolDetailOpen && key.upArrow) {
        moveOpenTool(-1)
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
    if (focusArea === 'navigation' && lower === 'a' && workspace === 'sets') openCreateSet()
    else if (focusArea === 'navigation' && lower === 'a' && workspace === 'servers') openServerEditor('create')
    else if (lower === 'r') void load(text(lang, 'refreshed'))
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

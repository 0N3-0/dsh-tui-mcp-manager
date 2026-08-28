import { sceneText as text } from './scene-i18n.js';
import { useServerEditorController } from './scene-server-editor-controller.js';
import { useSetEditorController } from './scene-set-editor-controller.js';
import { SCENE_POLL_MS, TABS, WORKSPACES, clamp, } from './scene-model.js';
/**
 * Own every mutable Scene concern without rendering any terminal elements.
 * Keeping this hook host-React-only prevents invalid hook calls while making
 * the view layer small enough for server forms to be migrated independently.
 */
export function useMcpManagerSceneController(props, manager, resolveLanguage, credentials) {
    const { React, ui, close } = props;
    const { useInput } = ui;
    const [lang, setLang] = React.useState('zh');
    const [snapshot, setSnapshot] = React.useState();
    const [workspace, setWorkspace] = React.useState('sets');
    const [focusArea, setFocusArea] = React.useState('navigation');
    const [selectedServerId, setSelectedServerId] = React.useState('');
    const [selectedSetId, setSelectedSetId] = React.useState('');
    const [tab, setTab] = React.useState('overview');
    const [detailActionIndex, setDetailActionIndex] = React.useState(0);
    const [toolIndex, setToolIndex] = React.useState(0);
    const [toolDetailOpen, setToolDetailOpen] = React.useState(false);
    const [doctor, setDoctor] = React.useState();
    const [busy, setBusy] = React.useState();
    const [notice, setNotice] = React.useState();
    const [error, setError] = React.useState();
    const [confirm, setConfirm] = React.useState();
    const [detailScrollTop, setDetailScrollTop] = React.useState(0);
    const mounted = React.useRef(true);
    const doctorRequest = React.useRef(0);
    const scrollDetailBy = (delta) => {
        setDetailScrollTop((current) => Math.max(0, current + Math.trunc(delta)));
    };
    const scrollDetailTo = (next) => {
        setDetailScrollTop(Math.max(0, Math.trunc(next)));
    };
    const load = React.useCallback(async (announcement) => {
        try {
            const next = await manager.invoke('list', {});
            if (!mounted.current)
                return;
            setSnapshot(next);
            setError(undefined);
            if (announcement !== undefined)
                setNotice(announcement);
        }
        catch (cause) {
            if (mounted.current)
                setError(cause instanceof Error ? cause.message : String(cause));
        }
    }, [manager]);
    React.useEffect(() => {
        mounted.current = true;
        void resolveLanguage().then((next) => {
            if (mounted.current)
                setLang(next);
        });
        let pollTimer;
        let stopped = false;
        let loading = false;
        let refreshAgain = false;
        let unsubscribe;
        const refresh = async () => {
            if (loading) {
                refreshAgain = true;
                return;
            }
            loading = true;
            do {
                refreshAgain = false;
                await load();
            } while (!stopped && refreshAgain);
            loading = false;
        };
        const poll = async () => {
            await refresh();
            if (!stopped)
                pollTimer = setTimeout(() => void poll(), SCENE_POLL_MS);
        };
        const start = async () => {
            // Initialization updates manager records and emits change notifications.
            // Subscribe after the authoritative first snapshot so those changes do
            // not schedule an identical second profile read on Scene open.
            await refresh();
            if (stopped)
                return;
            unsubscribe = manager.subscribe(() => void refresh());
            pollTimer = setTimeout(() => void poll(), SCENE_POLL_MS);
        };
        void start();
        return () => {
            stopped = true;
            mounted.current = false;
            unsubscribe?.();
            if (pollTimer !== undefined)
                clearTimeout(pollTimer);
        };
    }, [load]);
    const navItems = snapshot === undefined
        ? []
        : workspace === 'servers'
            ? snapshot.servers.map((server) => ({ kind: 'server', key: `server:${server.id}`, server }))
            : snapshot.sets.map((set) => ({ kind: 'set', key: `set:${set.id}`, set }));
    const selectedKey = workspace === 'servers' ? `server:${selectedServerId}` : `set:${selectedSetId}`;
    const selectedIndex = Math.max(0, navItems.findIndex((item) => item.key === selectedKey));
    const selected = navItems[selectedIndex];
    const selectedServer = selected?.kind === 'server' ? selected.server : undefined;
    const selectedSet = selected?.kind === 'set' ? selected.set : undefined;
    const activeToolDetailIndex = toolDetailOpen ? toolIndex : -1;
    const runDoctorFor = React.useCallback((serverId) => {
        const request = ++doctorRequest.current;
        setDoctor(undefined);
        setBusy(text(lang, 'doctorRunning'));
        setError(undefined);
        void manager.doctor(serverId).then((report) => {
            if (mounted.current && doctorRequest.current === request)
                setDoctor(report);
        }).catch((cause) => {
            if (mounted.current && doctorRequest.current === request) {
                setError(cause instanceof Error ? cause.message : String(cause));
            }
        }).finally(() => {
            if (mounted.current && doctorRequest.current === request)
                setBusy(undefined);
        });
    }, [lang]);
    React.useEffect(() => {
        const servers = snapshot?.servers ?? [];
        if (servers.length === 0) {
            if (selectedServerId !== '')
                setSelectedServerId('');
        }
        else if (!servers.some((server) => server.id === selectedServerId)) {
            setSelectedServerId(servers[0].id);
        }
    }, [selectedServerId, snapshot?.servers.map((server) => server.id).join('|')]);
    React.useEffect(() => {
        const sets = snapshot?.sets ?? [];
        if (sets.length === 0) {
            if (selectedSetId !== '')
                setSelectedSetId('');
        }
        else if (!sets.some((set) => set.id === selectedSetId)) {
            setSelectedSetId(sets[0].id);
        }
    }, [selectedSetId, snapshot?.sets.map((set) => set.id).join('|')]);
    React.useEffect(() => {
        setDoctor(undefined);
        setDetailActionIndex(0);
        setToolIndex(0);
        setToolDetailOpen(false);
        scrollDetailTo(0);
        if (selected?.kind === 'set')
            setTab('overview');
    }, [selected?.key]);
    React.useEffect(() => {
        setDetailActionIndex(0);
        setToolDetailOpen(false);
        scrollDetailTo(0);
    }, [tab]);
    React.useEffect(() => {
        scrollDetailTo(0);
    }, [selected?.key, tab, toolDetailOpen, activeToolDetailIndex]);
    React.useEffect(() => {
        if (tab === 'doctor' && selectedServer !== undefined)
            runDoctorFor(selectedServer.id);
    }, [runDoctorFor, selectedServer?.id, tab]);
    const mutate = async (action, pending, success) => {
        if (busy !== undefined)
            return false;
        setBusy(pending);
        setNotice(undefined);
        setError(undefined);
        try {
            const next = await action();
            if (!mounted.current)
                return false;
            setSnapshot(next);
            setNotice(success);
            return true;
        }
        catch (cause) {
            if (mounted.current)
                setError(cause instanceof Error ? cause.message : String(cause));
            return false;
        }
        finally {
            if (mounted.current)
                setBusy(undefined);
        }
    };
    const ensureWritable = () => {
        if (snapshot?.storage.writable)
            return true;
        setError(text(lang, 'readOnlyError'));
        return false;
    };
    const { editor: serverEditor, rows: serverEditorRows, open: openServerEditor, activateRow: activateServerEditorRow, handleInput: handleServerEditorInput, } = useServerEditorController({
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
    });
    const { editor: setEditor, rows: setEditorRows, openCreate: openCreateSet, openEdit: openEditSet, activateRow: activateSetEditorRow, handleInput: handleSetEditorInput, } = useSetEditorController({
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
    });
    const toggleSelected = () => {
        if (selectedSet === undefined || !ensureWritable())
            return;
        void mutate(() => manager.invoke('toggleSet', { id: selectedSet.id, enabled: !selectedSet.active }), text(lang, 'updated'), text(lang, 'updated'));
    };
    const reconnectSelected = () => {
        if (selectedServer === undefined || !selectedServer.enabled)
            return;
        void mutate(() => manager.invoke('reconnect', { id: selectedServer.id }), text(lang, 'reconnect'), text(lang, 'reconnected'));
    };
    const runDoctor = () => {
        if (selectedServer === undefined || busy !== undefined)
            return;
        setFocusArea('detail');
        if (tab === 'doctor')
            runDoctorFor(selectedServer.id);
        else
            setTab('doctor');
    };
    const confirmRemoval = () => {
        if (!ensureWritable())
            return;
        if (selectedServer !== undefined) {
            setConfirm({ kind: 'remove-server', id: selectedServer.id, label: selectedServer.name });
        }
        else if (selectedSet !== undefined) {
            setConfirm({ kind: 'remove-set', id: selectedSet.id, label: selectedSet.name });
        }
    };
    const removeConfirmed = () => {
        if (confirm === undefined)
            return;
        const action = confirm;
        setConfirm(undefined);
        void mutate(() => action.kind === 'remove-server'
            ? manager.invoke('remove', { id: action.id })
            : manager.invoke('removeSet', { id: action.id }), text(lang, 'remove'), text(lang, 'removed'));
    };
    const cancelRemoval = () => {
        setConfirm(undefined);
    };
    const selectNavItem = (item) => {
        setFocusArea('navigation');
        scrollDetailTo(0);
        if (item.kind === 'server')
            setSelectedServerId(item.server.id);
        else
            setSelectedSetId(item.set.id);
    };
    const selectWorkspace = (next) => {
        setWorkspace(next);
        setFocusArea('navigation');
        setToolDetailOpen(false);
        scrollDetailTo(0);
    };
    const moveWorkspace = () => {
        setWorkspace((current) => (WORKSPACES[(WORKSPACES.indexOf(current) + 1) % WORKSPACES.length]));
        setFocusArea('navigation');
        setToolDetailOpen(false);
        scrollDetailTo(0);
    };
    const selectTab = (next) => {
        setTab(next);
        setFocusArea('detail');
        setToolDetailOpen(false);
        scrollDetailTo(0);
    };
    const moveTab = (delta) => {
        setTab((current) => {
            const index = TABS.indexOf(current);
            return TABS[(index + delta + TABS.length) % TABS.length];
        });
        setFocusArea('detail');
        setToolDetailOpen(false);
        scrollDetailTo(0);
    };
    const openTool = (index) => {
        setToolIndex(index);
        setFocusArea('detail');
        setToolDetailOpen(true);
        scrollDetailTo(0);
    };
    const moveToolSelection = (delta) => {
        if (selectedServer === undefined || selectedServer.tools.length === 0)
            return;
        setToolIndex((current) => clamp(current + delta, selectedServer.tools.length));
    };
    const moveOpenTool = (delta) => {
        if (selectedServer === undefined || selectedServer.tools.length === 0)
            return;
        setToolIndex((current) => clamp(current + delta, selectedServer.tools.length));
        setFocusArea('detail');
        setToolDetailOpen(true);
        scrollDetailTo(0);
    };
    const moveNavSelection = (delta) => {
        if (navItems.length === 0)
            return;
        setFocusArea('navigation');
        scrollDetailTo(0);
        if (workspace === 'servers') {
            setSelectedServerId((current) => {
                const index = navItems.findIndex((item) => item.kind === 'server' && item.server.id === current);
                const next = navItems[clamp((index < 0 ? 0 : index) + delta, navItems.length)];
                return next?.kind === 'server' ? next.server.id : current;
            });
            return;
        }
        setSelectedSetId((current) => {
            const index = navItems.findIndex((item) => item.kind === 'set' && item.set.id === current);
            const next = navItems[clamp((index < 0 ? 0 : index) + delta, navItems.length)];
            return next?.kind === 'set' ? next.set.id : current;
        });
    };
    const detailActionCount = setEditor !== undefined || serverEditor !== undefined
        ? 0
        : selectedSet !== undefined
            ? 3
            : selectedServer !== undefined && tab === 'overview' ? 5 : 0;
    const moveDetailAction = (delta) => {
        if (detailActionCount === 0)
            return;
        setDetailActionIndex((current) => clamp(current + delta, detailActionCount));
    };
    const activateDetailAction = (index = detailActionIndex) => {
        if (detailActionCount === 0)
            return;
        const next = clamp(index, detailActionCount);
        setFocusArea('detail');
        setDetailActionIndex(next);
        if (selectedSet !== undefined) {
            if (next === 0)
                toggleSelected();
            else if (next === 1)
                openEditSet();
            else
                confirmRemoval();
            return;
        }
        if (selectedServer === undefined || tab !== 'overview')
            return;
        if (next === 0)
            openServerEditor('edit');
        else if (next === 1)
            openServerEditor('duplicate');
        else if (next === 2)
            reconnectSelected();
        else if (next === 3)
            runDoctor();
        else
            confirmRemoval();
    };
    useInput((input, key, event) => {
        const lower = input.toLowerCase();
        if (key.ctrl && lower === 'c')
            return;
        event.stopImmediatePropagation();
        if (confirm !== undefined) {
            if (key.return)
                removeConfirmed();
            else if (key.escape)
                cancelRemoval();
            return;
        }
        if (handleServerEditorInput(input, key))
            return;
        if (handleSetEditorInput(input, key))
            return;
        if (tab === 'tools' && selectedServer !== undefined && toolDetailOpen && key.escape) {
            setToolDetailOpen(false);
            scrollDetailTo(0);
            return;
        }
        if (key.escape) {
            if (focusArea === 'detail')
                setFocusArea('navigation');
            else
                close();
            return;
        }
        if (key.ctrl || key.meta || key.super)
            return;
        if (key.tab) {
            setFocusArea((current) => current === 'navigation' ? 'detail' : 'navigation');
            return;
        }
        if (lower === 'w') {
            moveWorkspace();
            return;
        }
        if (focusArea === 'detail' && (key.wheelUp || key.wheelDown)) {
            scrollDetailBy(key.wheelUp ? -3 : 3);
            return;
        }
        if (focusArea === 'detail' && (key.pageUp || key.pageDown)) {
            scrollDetailBy(key.pageUp ? -10 : 10);
            return;
        }
        if (focusArea === 'navigation') {
            if (key.upArrow) {
                moveNavSelection(-1);
                return;
            }
            if (key.downArrow) {
                moveNavSelection(1);
                return;
            }
            if (key.return && selected !== undefined) {
                setFocusArea('detail');
                return;
            }
        }
        else if (detailActionCount > 0) {
            if (key.upArrow) {
                moveDetailAction(-1);
                return;
            }
            if (key.downArrow) {
                moveDetailAction(1);
                return;
            }
            if (key.return) {
                activateDetailAction();
                return;
            }
            if (selectedServer !== undefined && (key.leftArrow || key.rightArrow)) {
                moveTab(key.leftArrow ? -1 : 1);
                return;
            }
        }
        else if (selectedServer !== undefined) {
            if (key.leftArrow || key.rightArrow) {
                moveTab(key.leftArrow ? -1 : 1);
                return;
            }
            if (tab === 'tools' && toolDetailOpen && key.downArrow) {
                moveOpenTool(1);
                return;
            }
            if (tab === 'tools' && toolDetailOpen && key.upArrow) {
                moveOpenTool(-1);
                return;
            }
            if (tab === 'tools' && !toolDetailOpen && key.upArrow) {
                moveToolSelection(-1);
                return;
            }
            if (tab === 'tools' && !toolDetailOpen && key.downArrow) {
                moveToolSelection(1);
                return;
            }
            if (tab === 'tools' && !toolDetailOpen && key.return && selectedServer.tools.length > 0) {
                openTool(clamp(toolIndex, selectedServer.tools.length));
                return;
            }
            if (key.upArrow) {
                scrollDetailBy(-1);
                return;
            }
            if (key.downArrow) {
                scrollDetailBy(1);
                return;
            }
        }
        else if (focusArea === 'detail') {
            if (key.upArrow) {
                scrollDetailBy(-1);
                return;
            }
            if (key.downArrow) {
                scrollDetailBy(1);
                return;
            }
        }
        if (focusArea === 'navigation' && lower === 'a' && workspace === 'sets')
            openCreateSet();
        else if (focusArea === 'navigation' && lower === 'a' && workspace === 'servers')
            openServerEditor('create');
        else if (lower === 'r')
            void load(text(lang, 'refreshed'));
    });
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
    };
}
//# sourceMappingURL=scene-controller.js.map
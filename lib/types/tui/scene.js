import { useMcpManagerSceneController } from './scene-controller.js';
import { doctorCheckLabel, doctorSuggestion, runtimeStateText, sceneText as text, } from './scene-i18n.js';
import { TABS, clamp, navWindow, } from './scene-model.js';
import { renderServerEditorView } from './scene-server-editor.js';
function stateGlyph(state) {
    switch (state) {
        case 'connected': return '\u2713';
        case 'starting': return '\u25b6';
        case 'reconnecting': return '\u21bb';
        case 'failed': return '\u2717';
        case 'disabled': return '\u25cb';
        case 'stopped': return '\u00d7';
    }
}
function stateColor(state) {
    switch (state) {
        case 'connected': return 'success';
        case 'starting':
        case 'reconnecting': return 'warning';
        case 'failed': return 'error';
        case 'disabled':
        case 'stopped': return 'inactive';
    }
}
function yesNo(lang, value) {
    return text(lang, value ? 'enabled' : 'disabled');
}
function json(value) {
    try {
        return JSON.stringify(value, null, 2);
    }
    catch {
        return String(value);
    }
}
export function createMcpManagerScene(manager, resolveLanguage, credentials) {
    return function McpManagerScene(props) {
        const { React, ui } = props;
        const { Box, Text, useTerminalSize } = ui;
        const { columns, rows } = useTerminalSize();
        const { lang, snapshot, workspace, focusArea, selectedIndex, navItems, selected, selectedServer, selectedSet, tab, detailActionIndex, toolIndex, toolDetailOpen, doctor, busy, notice, error, confirm, setEditor, setEditorRows, detailScrollTop, serverEditor, serverEditorRows, setFocusArea, setToolDetailOpen, selectNavItem, selectWorkspace, selectTab, openTool, activateDetailAction, openCreateSet, activateSetEditorRow, openServerEditor, activateServerEditorRow, removeConfirmed, cancelRemoval, scrollDetailTo, } = useMcpManagerSceneController(props, manager, resolveLanguage, credentials);
        const h = React.createElement;
        const ready = snapshot?.servers.filter((server) => server.state === 'connected').length ?? 0;
        const toolCount = snapshot?.servers.reduce((sum, server) => sum + server.tools.length, 0) ?? 0;
        const compact = columns < 72;
        const confirmHeight = confirm === undefined ? 0 : 8;
        const bodyHeight = Math.max(8, rows - (confirm === undefined ? 6 : 3) - confirmHeight);
        const detailHeight = compact ? Math.max(8, bodyHeight - 9) : bodyHeight;
        const detailScrollHeight = Math.max(3, detailHeight - (selectedServer === undefined ? 3 : 6));
        const activeDetailViewportHeight = serverEditor !== undefined || setEditor !== undefined
            ? Math.max(3, detailHeight - 2)
            : detailScrollHeight;
        const detailContentRef = React.useRef(null);
        const measuredDetailHeight = detailContentRef.current?.yogaNode?.getComputedHeight() ?? activeDetailViewportHeight;
        const maxDetailScrollTop = Math.max(0, Math.ceil(measuredDetailHeight) - activeDetailViewportHeight);
        const visibleDetailScrollTop = Math.min(detailScrollTop, maxDetailScrollTop);
        const navLimit = Math.max(4, compact ? 5 : bodyHeight - 4);
        const shownNav = navWindow(navItems, selectedIndex, navLimit);
        const selectedTool = selectedServer?.tools[clamp(toolIndex, selectedServer.tools.length)];
        const detailActionsVisible = setEditor === undefined && serverEditor === undefined
            && (selectedSet !== undefined || (selectedServer !== undefined && tab === 'overview'));
        // ScrollBox's DECSTBM optimization scrolls whole terminal rows and corrupts
        // a horizontal sibling. Keep this viewport clipped and move only its child.
        React.useLayoutEffect(() => {
            if (detailScrollTop !== visibleDetailScrollTop)
                scrollDetailTo(visibleDetailScrollTop);
        }, [detailScrollTop, visibleDetailScrollTop]);
        const renderDetailViewport = (key, content) => h(Box, {
            key,
            height: activeDetailViewportHeight,
            flexDirection: 'column',
            flexGrow: 0,
            flexShrink: 1,
            minHeight: 3,
            overflow: 'hidden',
            paddingRight: 1,
        }, h(Box, {
            ref: detailContentRef,
            position: 'relative',
            top: -visibleDetailScrollTop,
            width: '100%',
            flexDirection: 'column',
            flexShrink: 0,
        }, content));
        const row = (label, value, color) => h(Box, { flexDirection: 'row', minHeight: 1 }, h(Text, { color: 'subtle' }, `${label}: `), h(Text, { color, wrap: 'wrap' }, value || '-'));
        const renderNav = () => h(Box, {
            flexDirection: 'column',
            width: compact ? '100%' : Math.min(34, Math.max(24, Math.floor(columns * 0.3))),
            height: compact ? 8 : bodyHeight,
            minHeight: 7,
            flexShrink: 0,
            borderStyle: 'round',
            borderColor: focusArea === 'navigation' ? 'suggestion' : 'inactive',
            paddingX: 1,
        }, h(Text, { bold: true, color: 'permission' }, `${text(lang, workspace)}  ${navItems.length}`), navItems.length === 0 && h(Text, { color: 'subtle' }, text(lang, workspace === 'servers' ? 'noServers' : 'noSets')), ...shownNav.map((item) => {
            const selectedItem = item.key === selected?.key;
            const focused = selectedItem && focusArea === 'navigation';
            if (item.kind === 'server') {
                return h(Box, {
                    key: item.key,
                    flexDirection: 'row',
                    height: 1,
                    onClick: setEditor === undefined && serverEditor === undefined ? () => selectNavItem(item) : undefined,
                    backgroundColor: focused ? 'selectionBg' : undefined,
                }, h(Text, { color: focused ? undefined : stateColor(item.server.state) }, focused ? '\u276f ' : '  '), h(Text, { color: focused ? undefined : stateColor(item.server.state) }, `${stateGlyph(item.server.state)} `), h(Text, { bold: selectedItem, wrap: 'truncate-end' }, item.server.name), h(Box, { flexGrow: 1 }), h(Text, { color: focused ? undefined : 'subtle' }, String(item.server.tools.length)));
            }
            return h(Box, {
                key: item.key,
                flexDirection: 'row',
                height: 1,
                onClick: setEditor === undefined && serverEditor === undefined ? () => selectNavItem(item) : undefined,
                backgroundColor: focused ? 'selectionBg' : undefined,
            }, h(Text, { color: focused ? undefined : 'subtle' }, focused ? '\u276f ' : '  '), h(Text, { color: focused ? undefined : item.set.active ? 'success' : 'inactive' }, `${item.set.active ? '\u25c6' : '\u25c7'} `), h(Text, { bold: selectedItem, wrap: 'truncate-end' }, item.set.name), h(Box, { flexGrow: 1 }), h(Text, { color: focused ? undefined : 'subtle' }, String(item.set.serverIds.length)));
        }), h(Box, {
            marginTop: 1,
            onClick: setEditor === undefined && serverEditor === undefined
                ? () => workspace === 'servers' ? openServerEditor('create') : openCreateSet()
                : undefined,
        }, h(Text, { color: 'success', wrap: 'truncate-end' }, `+ ${text(lang, workspace === 'servers' ? 'createServer' : 'createSet')}`)));
        const renderOverview = (server) => h(React.Fragment, null, row(text(lang, 'runtime'), runtimeStateText(lang, server.state), stateColor(server.state)), row(text(lang, 'transport'), server.transport), row(text(lang, 'namespace'), server.serverName), row(text(lang, 'endpoint'), server.transport === 'stdio'
            ? [server.command, ...(server.args ?? [])].filter(Boolean).join(' ')
            : server.url ?? '-'), row(text(lang, 'enabled'), yesNo(lang, server.enabled), server.enabled ? 'success' : 'inactive'), row(text(lang, 'tools'), `${server.tools.length} ${text(lang, 'toolCount')}`), server.error !== undefined && h(Box, { marginTop: 1, borderStyle: 'round', borderColor: 'error', paddingX: 1 }, h(Text, { color: 'error', wrap: 'wrap' }, server.error)), h(Box, { marginTop: 1 }, h(Text, { color: 'subtle', wrap: 'wrap' }, text(lang, 'previewLimit'))));
        const renderTools = (server) => {
            if (server.tools.length === 0)
                return h(Text, { color: 'subtle' }, text(lang, 'noTools'));
            const tool = selectedTool ?? server.tools[0];
            if (!toolDetailOpen) {
                const selectedToolIndex = clamp(toolIndex, server.tools.length);
                const capacity = Math.max(1, detailScrollHeight - 1);
                const start = Math.min(Math.max(0, selectedToolIndex - Math.floor(capacity / 2)), Math.max(0, server.tools.length - capacity));
                const visibleTools = server.tools.slice(start, start + capacity);
                return h(React.Fragment, null, h(Text, { bold: true, color: 'permission' }, `${text(lang, 'toolList')}  ${server.tools.length}`), ...visibleTools.map((item, offset) => {
                    const index = start + offset;
                    const selectedItem = index === selectedToolIndex;
                    const focused = selectedItem && focusArea === 'detail';
                    return h(Box, {
                        key: item.name,
                        flexDirection: 'row',
                        width: '100%',
                        height: 1,
                        paddingX: 1,
                        onClick: () => openTool(index),
                        backgroundColor: focused ? 'selectionBg' : undefined,
                    }, h(Text, { color: focused ? undefined : 'subtle' }, focused ? '\u276f ' : '  '), h(Text, { bold: selectedItem, wrap: 'truncate-end' }, item.name), h(Box, { flexGrow: 1 }), h(Text, { color: focused ? undefined : 'subtle' }, text(lang, 'openTool')));
                }));
            }
            const descriptionLines = (tool.description || '-').split('\n');
            const schemaLines = json(tool.parameters).split('\n');
            return h(React.Fragment, null, h(Box, {
                alignSelf: 'flex-start',
                paddingX: 1,
                onClick: () => {
                    setToolDetailOpen(false);
                    setFocusArea('detail');
                    scrollDetailTo(0);
                },
            }, h(Text, { bold: true, color: 'permission' }, `← ${text(lang, 'backToTools')}`)), h(Box, { height: 1 }), h(Text, { bold: true, color: 'suggestion' }, `${clamp(toolIndex, server.tools.length) + 1}/${server.tools.length}  ${tool.name}`), h(Box, { marginTop: 1, flexDirection: 'column' }, h(Text, { bold: true, color: 'permission' }, text(lang, 'description')), ...descriptionLines.map((line, index) => h(Text, { key: `description:${index}`, color: 'subtle', wrap: 'wrap' }, line || ' '))), h(Box, { marginTop: 1, flexDirection: 'column' }, h(Text, { bold: true, color: 'permission' }, text(lang, 'schema')), ...schemaLines.map((line, index) => h(Text, { key: `schema:${index}`, color: 'subtle', wrap: 'wrap' }, line || ' '))));
        };
        const renderDoctor = () => {
            if (busy === text(lang, 'doctorRunning'))
                return h(Text, { color: 'warning' }, text(lang, 'doctorRunning'));
            if (doctor === undefined)
                return h(Text, { color: 'subtle' }, text(lang, 'runDoctor'));
            return h(React.Fragment, null, ...doctor.checks.map((check) => h(Box, { key: check.id, flexDirection: 'column', marginBottom: 1 }, h(Box, { flexDirection: 'row' }, h(Text, { color: check.state === 'pass' ? 'success' : check.state === 'warn' ? 'warning' : 'error' }, `${check.state === 'pass' ? '\u2713' : check.state === 'warn' ? '!' : '\u2717'} `), h(Text, { bold: true }, doctorCheckLabel(lang, check.id))), h(Text, { color: 'subtle', wrap: 'wrap' }, check.detail), check.suggestion !== undefined && h(Box, { flexDirection: 'row', marginTop: 1, paddingLeft: 2 }, h(Text, { color: 'warning', wrap: 'wrap' }, `${text(lang, 'suggestion')}: ${doctorSuggestion(lang, check.suggestion)}`)))));
        };
        const entries = (value) => Object.keys(value ?? {}).join(', ') || '-';
        const renderConfig = (server) => h(React.Fragment, null, server.transport === 'stdio'
            ? h(React.Fragment, null, row(text(lang, 'command'), server.command ?? '-'), row(text(lang, 'arguments'), (server.args ?? []).join(' ') || '-'), row(text(lang, 'workingDirectory'), server.cwd ?? '-'), row(text(lang, 'environment'), entries(server.env)), row(text(lang, 'credentialRefs'), Object.values(server.secretEnv ?? {}).map((entry) => entry.ref).join(', ') || '-'))
            : h(React.Fragment, null, row(text(lang, 'endpoint'), server.url ?? '-'), row(text(lang, 'headers'), entries(server.headers)), row(text(lang, 'credentialRefs'), Object.values(server.secretHeaders ?? {}).map((entry) => entry.ref).join(', ') || '-')), row(text(lang, 'timeout'), `${server.toolCallTimeoutMs ?? 60_000} ms`), row(text(lang, 'failStartup'), yesNo(lang, server.failOnStartupError ?? false)), row(text(lang, 'reconnectPolicy'), server.reconnect?.enabled === false
            ? text(lang, 'disabled')
            : `${server.reconnect?.initialDelayMs ?? 500} -> ${server.reconnect?.maxDelayMs ?? 30_000} ms / ${server.reconnect?.maxAttempts ?? 10}`));
        const renderSetEditor = (editor) => h(React.Fragment, null, h(Text, { color: 'subtle', wrap: 'wrap' }, text(lang, 'setEditorHint')), h(Text, { color: 'permission' }, `${text(lang, 'setMembers')}: ${editor.draft.serverIds.length}/${snapshot?.servers.length ?? 0}`), editor.error !== undefined && h(Box, { marginTop: 1, borderStyle: 'round', borderColor: 'error', paddingX: 1 }, h(Text, { color: 'error', wrap: 'wrap' }, editor.error)), h(Box, { height: 1 }), ...setEditorRows.map((item, index) => {
            const focused = index === editor.selected;
            const common = {
                key: item.kind === 'field' ? `field:${item.field}` : item.kind === 'member' ? `member:${item.server.id}` : item.kind,
                flexDirection: 'row',
                minHeight: 1,
                paddingX: 1,
                onClick: () => activateSetEditorRow(index),
            };
            if (item.kind === 'field') {
                const value = editor.draft[item.field];
                const editing = editor.editing === item.field;
                return h(Box, common, h(Text, { color: focused ? undefined : 'subtle' }, focused ? '\u276f ' : '  '), h(Text, { color: 'permission' }, `${text(lang, item.field === 'id' ? 'setId' : 'setName')}: `), h(Text, { bold: focused, color: item.editable ? undefined : 'subtle', wrap: 'truncate-end' }, `${value || text(lang, 'valueEmpty')}${editing ? '\u258d' : ''}`), h(Box, { flexGrow: 1 }), item.editable && h(Text, { color: 'subtle' }, text(lang, 'editValue')));
            }
            if (item.kind === 'member') {
                const member = editor.draft.serverIds.includes(item.server.id);
                return h(Box, common, h(Text, { color: focused ? undefined : 'subtle' }, focused ? '\u276f ' : '  '), h(Text, { color: member ? 'success' : 'inactive' }, `${member ? '\u2713' : '\u25cb'} `), h(Text, { bold: focused, wrap: 'truncate-end' }, item.server.name), h(Box, { flexGrow: 1 }), h(Text, { color: stateColor(item.server.state) }, runtimeStateText(lang, item.server.state)), h(Text, { color: 'subtle' }, `  ${item.server.tools.length}`));
            }
            return h(Box, common, h(Text, { color: focused ? undefined : 'subtle' }, focused ? '\u276f ' : '  '), h(Text, { bold: focused, color: item.kind === 'save' ? 'success' : 'inactive' }, `${item.kind === 'save' ? '\u2713' : '\u00d7'} ${text(lang, item.kind)}`));
        }));
        const renderSet = (set) => {
            const members = set.serverIds.map((id) => snapshot?.servers.find((server) => server.id === id));
            return h(React.Fragment, null, row(text(lang, 'active'), text(lang, set.active ? 'active' : 'inactive'), set.active ? 'success' : 'inactive'), row(text(lang, 'members'), String(set.serverIds.length)), h(Box, { marginTop: 1, flexDirection: 'column' }, ...members.map((server, index) => h(Box, { key: set.serverIds[index], flexDirection: 'row' }, h(Text, { color: server === undefined ? 'error' : stateColor(server.state) }, server === undefined ? '? ' : `${stateGlyph(server.state)} `), h(Text, null, server?.name ?? set.serverIds[index]), h(Box, { flexGrow: 1 }), h(Text, { color: 'subtle' }, server === undefined ? '' : String(server.tools.length))))), h(Box, { marginTop: 1 }, h(Text, { color: 'subtle' }, text(lang, 'setHint'))), h(Box, { height: 1 }), renderDetailAction(0, set.active ? '○' : '◆', text(lang, set.active ? 'disableSet' : 'enableSet'), set.active ? 'warning' : 'success'), renderDetailAction(1, '\u2192', text(lang, 'editSet'), 'suggestion'), renderDetailAction(2, '×', text(lang, 'deleteSet'), 'error'));
        };
        const detailFocused = focusArea === 'detail'
            && (selected !== undefined || setEditor !== undefined || serverEditor !== undefined);
        const renderDetailAction = (index, glyph, label, color, disabled = false) => {
            const focused = detailFocused && detailActionIndex === index;
            return h(Box, {
                flexDirection: 'row',
                height: 1,
                onClick: disabled ? undefined : () => activateDetailAction(index),
            }, h(Text, { color: focused ? undefined : 'subtle' }, focused ? '\u276f ' : '  '), h(Text, { bold: focused, color: focused ? undefined : disabled ? 'inactive' : color }, `${glyph} ${label}`));
        };
        const renderServerActions = (server) => h(React.Fragment, null, renderDetailAction(0, '\u2192', text(lang, 'editServer'), 'suggestion'), renderDetailAction(1, '+', text(lang, 'duplicateServer'), 'permission'), renderDetailAction(2, '\u21bb', text(lang, 'reconnect'), 'success', !server.enabled), renderDetailAction(3, '\u25c7', text(lang, 'doctor'), 'permission'), renderDetailAction(4, '×', text(lang, 'deleteServer'), 'error'), h(Box, { height: 1 }));
        const renderDetailHeader = (title, meta) => h(Box, {
            flexDirection: 'row',
            height: 1,
            onClick: () => setFocusArea('detail'),
        }, h(Text, {
            bold: true,
            color: 'permission',
            wrap: 'truncate-end',
        }, title), h(Box, { flexGrow: 1 }), h(Text, { color: 'subtle', wrap: 'truncate-end' }, meta));
        const renderDetail = () => h(Box, {
            flexDirection: 'column',
            flexGrow: 1,
            flexShrink: 1,
            height: detailHeight,
            minWidth: 0,
            minHeight: compact ? 8 : 0,
            borderStyle: 'round',
            borderColor: detailFocused ? 'suggestion' : 'inactive',
            paddingX: 1,
        }, serverEditor !== undefined
            ? h(React.Fragment, null, renderDetailHeader(text(lang, serverEditor.intent === 'create'
                ? 'createServer'
                : serverEditor.intent === 'duplicate' ? 'duplicateServer' : 'editServer'), serverEditor.draft.id), renderDetailViewport(`server-editor:${serverEditor.intent}:${serverEditor.draft.transport}`, renderServerEditorView({
                React,
                ui,
                lang,
                snapshot,
                editor: serverEditor,
                rows: serverEditorRows,
                activateRow: activateServerEditorRow,
            })))
            : setEditor !== undefined
                ? h(React.Fragment, null, renderDetailHeader(text(lang, setEditor.mode === 'create' ? 'createSet' : 'editSet'), setEditor.draft.id), renderDetailViewport(`set-editor:${setEditor.mode}`, renderSetEditor(setEditor)))
                : selected === undefined
                    ? h(Text, { color: 'subtle' }, text(lang, 'noSelection'))
                    : h(React.Fragment, null, renderDetailHeader(selected.kind === 'server' ? selected.server.name : selected.set.name, selected.kind === 'server' ? selected.server.id : `${selected.set.id}  ${selected.set.active ? '\u25c6' : '\u25c7'}`), selected.kind === 'server' && h(Box, { flexDirection: 'row', marginTop: 1, marginBottom: 1, alignSelf: 'flex-start' }, ...TABS.map((item, index) => h(Box, {
                        key: item,
                        onClick: () => selectTab(item),
                        height: 1,
                    }, h(Text, {
                        bold: tab === item,
                        color: tab === item ? 'suggestion' : 'subtle',
                        inverse: tab === item,
                    }, `  ${index + 1} ${text(lang, item)}  `)))), renderDetailViewport(`${selected.key}:${selected.kind === 'server' ? tab : 'set'}:${toolDetailOpen ? `detail:${toolIndex}` : 'list'}`, selected.kind === 'set'
                        ? renderSet(selected.set)
                        : tab === 'tools'
                            ? renderTools(selected.server)
                            : tab === 'overview'
                                ? h(React.Fragment, null, renderOverview(selected.server), h(Box, { height: 1 }), renderServerActions(selected.server))
                                : tab === 'doctor' ? renderDoctor() : renderConfig(selected.server))));
        const renderWorkspaceTab = (item, count) => {
            const active = workspace === item;
            return h(Box, {
                key: item,
                onClick: setEditor === undefined && serverEditor === undefined ? () => selectWorkspace(item) : undefined,
                flexDirection: 'row',
                height: 1,
            }, h(Text, { bold: active, color: active ? 'suggestion' : 'subtle', inverse: active }, `  ${active ? '\u25c6' : '\u25c7'} ${text(lang, item)}  ${count}  `));
        };
        return h(Box, { flexDirection: 'column', width: '100%', height: rows, paddingX: 1 }, h(Box, { flexDirection: 'row', height: 1, flexShrink: 0, alignItems: 'center' }, h(Text, { bold: true, color: 'permission' }, text(lang, 'title')), h(Text, { color: 'subtle' }, `  ${text(lang, 'subtitle')}`), h(Box, { flexGrow: 1 }), snapshot !== undefined && h(Text, { color: 'subtle' }, `${snapshot.profile.key}  ${ready}/${snapshot.servers.length} ${text(lang, 'ready')}  ${toolCount} ${text(lang, 'toolCount')}`)), h(Box, { flexDirection: 'row', height: 1, flexShrink: 0 }, snapshot !== undefined && h(Text, { color: snapshot.storage.writable ? 'success' : 'warning' }, `${text(lang, 'storage')}: ${snapshot.storage.writable ? text(lang, 'writable') : text(lang, 'readOnly')}`), snapshot !== undefined && h(Text, { color: 'subtle' }, `  ${text(lang, 'managedBlock')}: ${snapshot.storage.managedBlock ? '\u2713' : '\u00d7'}`), h(Box, { flexGrow: 1 }), busy !== undefined && h(Text, { color: 'warning' }, busy), busy === undefined && error !== undefined && h(Text, { color: 'error', wrap: 'truncate-end' }, `${text(lang, 'error')}: ${error}`), busy === undefined && error === undefined && notice !== undefined && h(Text, { color: 'success' }, notice)), snapshot !== undefined && h(Box, { flexDirection: 'row', height: 1, flexShrink: 0 }, renderWorkspaceTab('sets', snapshot.sets.length), renderWorkspaceTab('servers', snapshot.servers.length), h(Box, { flexGrow: 1 }), h(Text, { color: 'subtle' }, `w ${text(lang, 'switchWorkspace')}`)), snapshot === undefined
            ? h(Box, { flexGrow: 1, alignItems: 'center', justifyContent: 'center' }, h(Text, { color: error === undefined ? 'subtle' : 'error' }, error ?? text(lang, 'loading')))
            : h(Box, {
                flexDirection: compact ? 'column' : 'row',
                height: bodyHeight,
                flexGrow: 0,
                flexShrink: 1,
                minHeight: 0,
                columnGap: 1,
                rowGap: 1,
            }, renderNav(), renderDetail()), confirm !== undefined && h(Box, { flexDirection: 'column', flexShrink: 0, borderStyle: 'round', borderColor: 'error', paddingX: 1, marginTop: 1 }, h(Text, { bold: true, color: 'error' }, `${text(lang, 'remove')}: ${confirm.label}`), h(Text, null, text(lang, confirm.kind === 'remove-server' ? 'confirmRemoveServer' : 'confirmRemoveSet')), h(Box, { flexDirection: 'row', columnGap: 2 }, h(Box, { borderStyle: 'round', borderColor: 'error', paddingX: 1, onClick: removeConfirmed }, h(Text, { bold: true }, `Enter  ${text(lang, 'confirmAction')}`)), h(Box, { borderStyle: 'round', borderColor: 'subtle', paddingX: 1, onClick: cancelRemoval }, h(Text, { bold: true }, `Esc  ${text(lang, 'cancel')}`)))), confirm === undefined && h(Box, { flexDirection: 'row', minHeight: 2, flexShrink: 0, paddingTop: 1, columnGap: 2, flexWrap: 'wrap' }, serverEditor !== undefined
            ? h(React.Fragment, null, serverEditor.editing !== undefined
                ? h(Text, { color: 'suggestion' }, `Enter ${text(lang, 'back')}  Backspace ${text(lang, 'deleteCharacter')}  Ctrl+U ${text(lang, 'clearValue')}  Esc ${text(lang, 'cancel')}`)
                : h(Text, { color: 'suggestion' }, `↑↓ ${text(lang, 'navigate')}  Enter ${text(lang, 'editValue')}  Esc ${text(lang, 'cancel')}`))
            : setEditor !== undefined
                ? h(React.Fragment, null, setEditor.editing !== undefined
                    ? h(Text, { color: 'suggestion' }, `Enter ${text(lang, 'back')}  Backspace ${text(lang, 'deleteCharacter')}  Esc ${text(lang, 'cancel')}`)
                    : h(Text, { color: 'suggestion' }, `\u2191\u2193 ${text(lang, 'navigate')}  Enter ${text(lang, 'editValue')}  Esc ${text(lang, 'cancel')}`))
                : h(React.Fragment, null, h(Text, { color: focusArea === 'navigation' ? 'suggestion' : 'permission' }, `Tab ${text(lang, 'focus')}: ${text(lang, focusArea === 'navigation' ? 'navigationPane' : 'detailPane')}`), h(Text, { color: 'subtle' }, `w ${text(lang, 'switchWorkspace')}`), focusArea === 'navigation' && h(Text, { color: 'subtle' }, `\u2191\u2193 ${text(lang, 'navigate')}`), focusArea === 'detail' && detailActionsVisible && h(Text, { color: 'suggestion' }, `\u2191\u2193 ${text(lang, 'navigateActions')}  Enter ${text(lang, 'activateAction')}`), focusArea === 'detail' && selected !== undefined && h(Text, { color: 'subtle' }, `PgUp/PgDn ${text(lang, 'scroll')}`), focusArea === 'detail' && selectedServer !== undefined && h(Text, { color: 'subtle' }, `\u2190\u2192 ${text(lang, 'tabs')}`), focusArea === 'detail' && selectedServer !== undefined && tab === 'tools' && h(Text, { color: 'subtle' }, toolDetailOpen
                    ? `\u2191\u2193 ${text(lang, 'toolNav')}`
                    : `\u2191\u2193 ${text(lang, 'toolNav')}  Enter ${text(lang, 'openTool')}`), workspace === 'sets' && h(Text, { color: 'subtle' }, `a ${text(lang, 'createSet')}`), workspace === 'servers' && h(Text, { color: 'subtle' }, `a ${text(lang, 'createServer')}`), h(Text, { color: 'subtle' }, `r ${text(lang, 'refresh')}`), h(Text, { color: 'subtle' }, `Esc ${text(lang, toolDetailOpen || focusArea === 'detail' ? 'back' : 'close')}`))));
    };
}
//# sourceMappingURL=scene.js.map
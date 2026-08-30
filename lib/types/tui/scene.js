import { useMcpManagerSceneController } from './scene-controller.js';
import { sceneText as text, } from './scene-i18n.js';
import { TABS, navWindow, } from './scene-model.js';
import { renderServerDetailView, serverStateColor, serverStateGlyph, } from './scene-server-detail.js';
import { renderServerEditorView, serverEditorSelectionHelp } from './scene-server-editor.js';
import { SceneSearchInput } from './scene-search-input.js';
import { renderSetDetailView, renderSetEditorView, setEditorSelectionHelp } from './scene-set-detail.js';
export function createMcpManagerScene(manager, resolveLanguage, credentials) {
    return function McpManagerScene(props) {
        const { React, ui } = props;
        const { Box, Text, useTerminalSize } = ui;
        const { columns, rows } = useTerminalSize();
        const { lang, snapshot, workspace, focusArea, selectedIndex, navItems, navTotal, navFilter, navSearchCursor, selected, selectedServer, selectedSet, tab, detailActionIndex, toolIndex, toolDetailOpen, doctor, busy, notice, error, confirm, setEditor, setEditorRows, detailScrollTop, serverEditor, serverEditorRows, selectedFilteredToolIndex, toolFilter, toolSearchCursor, filteredToolIndices, setFocusArea, setToolDetailOpen, selectNavItem, selectWorkspace, selectTab, beginNavSearch, beginToolSearch, openTool, activateDetailAction, openCreateSet, activateSetEditorRow, openServerEditor, activateServerEditorRow, removeConfirmed, cancelRemoval, scrollDetailTo, } = useMcpManagerSceneController(props, manager, resolveLanguage, credentials);
        const h = React.createElement;
        const ready = snapshot?.servers.filter((server) => server.state === 'connected').length ?? 0;
        const toolCount = snapshot?.servers.reduce((sum, server) => sum + server.tools.length, 0) ?? 0;
        const compact = columns < 72;
        const navWidth = compact ? columns - 2 : Math.min(34, Math.max(24, Math.floor(columns * 0.3)));
        const editorRowWidth = compact
            ? Math.max(12, columns - 10)
            : Math.max(12, columns - navWidth - 11);
        const editorHelp = serverEditor !== undefined
            ? serverEditorSelectionHelp(lang, serverEditor, serverEditorRows)
            : setEditor !== undefined
                ? setEditorSelectionHelp(lang, setEditor, setEditorRows)
                : navSearchCursor !== undefined
                    ? text(lang, workspace === 'servers' ? 'helpSearchServers' : 'helpSearchSets')
                    : toolSearchCursor !== undefined ? text(lang, 'helpSearchTools') : undefined;
        const confirmHeight = confirm === undefined ? 0 : 8;
        const bodyHeight = Math.max(8, rows - (confirm === undefined ? 6 + (editorHelp === undefined ? 0 : 1) : 3) - confirmHeight);
        const detailHeight = compact ? Math.max(8, bodyHeight - 9) : bodyHeight;
        const detailScrollHeight = Math.max(3, detailHeight - (selectedServer === undefined ? 3 : 6));
        const activeDetailViewportHeight = serverEditor !== undefined || setEditor !== undefined
            ? Math.max(3, detailHeight - 2)
            : detailScrollHeight;
        const detailContentRef = React.useRef(null);
        const measuredDetailHeight = detailContentRef.current?.yogaNode?.getComputedHeight() ?? activeDetailViewportHeight;
        const maxDetailScrollTop = Math.max(0, Math.ceil(measuredDetailHeight) - activeDetailViewportHeight);
        const visibleDetailScrollTop = Math.min(detailScrollTop, maxDetailScrollTop);
        const navLimit = Math.max(1, compact ? 2 : bodyHeight - 6);
        const shownNav = navWindow(navItems, selectedIndex, navLimit);
        const detailActionsVisible = setEditor === undefined && serverEditor === undefined
            && (selectedSet !== undefined || (selectedServer !== undefined && tab === 'overview'));
        const serverEditorEnterAction = serverEditor === undefined
            ? 'editValue'
            : (() => {
                const row = serverEditorRows[serverEditor.selected];
                if (row?.kind === 'transport')
                    return 'toggle';
                if (row?.kind === 'boolean')
                    return 'toggleOption';
                if (row?.kind === 'save')
                    return 'save';
                if (row?.kind === 'cancel')
                    return 'cancel';
                return 'editValue';
            })();
        const setEditorEnterAction = setEditor === undefined
            ? 'editValue'
            : (() => {
                const row = setEditorRows[setEditor.selected];
                if (row?.kind === 'search')
                    return 'search';
                if (row?.kind === 'member')
                    return 'toggleMember';
                if (row?.kind === 'boolean')
                    return 'toggleOption';
                if (row?.kind === 'save')
                    return 'save';
                if (row?.kind === 'cancel')
                    return 'cancel';
                return 'editValue';
            })();
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
        const renderNav = () => h(Box, {
            flexDirection: 'column',
            width: compact ? '100%' : navWidth,
            height: compact ? 8 : bodyHeight,
            minHeight: 7,
            flexShrink: 0,
            borderStyle: 'round',
            borderColor: focusArea === 'navigation' ? 'suggestion' : 'inactive',
            paddingX: 1,
        }, h(Text, { bold: true, color: 'permission' }, `${text(lang, workspace)}  ${navItems.length}/${navTotal}`), h(SceneSearchInput, {
            React,
            ui,
            query: navFilter,
            cursor: navSearchCursor,
            maxWidth: Math.max(3, navWidth - 7),
            compact: true,
            beginSearch: beginNavSearch,
        }), navTotal === 0 && h(Text, { color: 'subtle' }, text(lang, workspace === 'servers' ? 'noServers' : 'noSets')), navTotal > 0 && navItems.length === 0 && h(Text, { color: 'subtle' }, text(lang, 'noMatches')), ...shownNav.map((item) => {
            const selectedItem = item.key === selected?.key;
            const focused = selectedItem && focusArea === 'navigation';
            if (item.kind === 'server') {
                return h(Box, {
                    key: item.key,
                    flexDirection: 'row',
                    height: 1,
                    onClick: setEditor === undefined && serverEditor === undefined ? () => selectNavItem(item) : undefined,
                    backgroundColor: focused ? 'selectionBg' : undefined,
                }, h(Text, { color: focused ? undefined : serverStateColor(item.server.state) }, focused ? '\u276f ' : '  '), h(Text, { color: focused ? undefined : serverStateColor(item.server.state) }, `${serverStateGlyph(item.server.state)} `), h(Text, { bold: selectedItem, wrap: 'truncate-end' }, item.server.name), h(Box, { flexGrow: 1 }), h(Text, { color: focused ? undefined : 'subtle' }, String(item.server.tools.length)));
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
        const renderServerActions = (server) => h(React.Fragment, null, renderDetailAction(0, '\u2192', text(lang, 'editServer'), 'suggestion'), renderDetailAction(1, '+', text(lang, 'duplicateServer'), 'permission'), renderDetailAction(2, server.state === 'stopped' ? '\u25b6' : '\u25a0', text(lang, server.state === 'stopped' ? 'resumeServer' : 'stopServer'), server.state === 'stopped' ? 'success' : 'warning', !server.enabled), renderDetailAction(3, '\u21bb', text(lang, 'reconnect'), 'success', !server.enabled || server.state === 'stopped'), renderDetailAction(4, '\u25c7', text(lang, 'doctor'), 'permission'), renderDetailAction(5, '×', text(lang, 'deleteServer'), 'error'), h(Box, { height: 1 }));
        const renderSetActions = () => selectedSet === undefined ? null : h(React.Fragment, null, renderDetailAction(selectedSet.serverIds.length, selectedSet.active ? '○' : '◆', text(lang, selectedSet.active ? 'disableSet' : 'enableSet'), selectedSet.active ? 'warning' : 'success'), renderDetailAction(selectedSet.serverIds.length + 1, '\u2192', text(lang, 'editSet'), 'suggestion'), renderDetailAction(selectedSet.serverIds.length + 2, '×', text(lang, 'deleteSet'), 'error'));
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
                rowWidth: editorRowWidth,
                activateRow: activateServerEditorRow,
            })))
            : setEditor !== undefined
                ? h(React.Fragment, null, renderDetailHeader(text(lang, setEditor.mode === 'create' ? 'createSet' : 'editSet'), setEditor.draft.id), renderDetailViewport(`set-editor:${setEditor.mode}`, renderSetEditorView({
                    React,
                    ui,
                    lang,
                    snapshot,
                    editor: setEditor,
                    rows: setEditorRows,
                    rowWidth: editorRowWidth,
                    activateRow: activateSetEditorRow,
                })))
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
                    }, `  ${index + 1} ${text(lang, item)}  `)))), renderDetailViewport(`${selected.key}:${selected.kind === 'server' ? tab : 'set'}:${toolDetailOpen ? `detail:${toolIndex}` : `list:${toolFilter}`}`, selected.kind === 'set'
                        ? h(React.Fragment, null, renderSetDetailView({
                            React,
                            ui,
                            lang,
                            snapshot,
                            set: selected.set,
                            focusArea,
                            selectedMemberIndex: detailActionIndex < selected.set.serverIds.length ? detailActionIndex : -1,
                            activateMember: activateDetailAction,
                        }), h(Box, { height: 1 }), renderSetActions())
                        : h(React.Fragment, null, renderServerDetailView({
                            React,
                            ui,
                            lang,
                            server: selected.server,
                            sets: snapshot.sets,
                            tab,
                            focusArea,
                            toolIndex: toolDetailOpen ? toolIndex : selectedFilteredToolIndex,
                            toolDetailOpen,
                            toolFilter,
                            toolSearchCursor,
                            filteredToolIndices,
                            detailScrollHeight,
                            doctor,
                            busy,
                            setToolDetailOpen,
                            setFocusArea,
                            scrollDetailTo,
                            beginToolSearch,
                            openTool,
                        }), tab === 'overview' && h(Box, { height: 1 }), tab === 'overview' && renderServerActions(selected.server)))));
        const renderWorkspaceTab = (item, count) => {
            const active = workspace === item;
            return h(Box, {
                key: item,
                onClick: setEditor === undefined && serverEditor === undefined ? () => selectWorkspace(item) : undefined,
                flexDirection: 'row',
                height: 1,
            }, h(Text, { bold: active, color: active ? 'suggestion' : 'subtle', inverse: active }, `  ${active ? '\u25c6' : '\u25c7'} ${text(lang, item)}  ${count}  `));
        };
        return h(Box, { flexDirection: 'column', width: '100%', height: rows, paddingX: 1 }, h(Box, { flexDirection: 'row', height: 1, flexShrink: 0, alignItems: 'center' }, h(Text, { bold: true, color: 'permission' }, text(lang, 'title')), h(Box, { flexGrow: 1 }), snapshot !== undefined && h(Text, { color: 'subtle' }, `${snapshot.profile.key}  ${ready}/${snapshot.servers.length} ${text(lang, 'ready')}  ${toolCount} ${text(lang, 'toolCount')}`)), h(Box, { flexDirection: 'row', height: 1, flexShrink: 0 }, snapshot !== undefined && h(Text, { color: snapshot.storage.writable ? 'success' : 'warning' }, `${text(lang, 'storage')}: ${snapshot.storage.writable ? text(lang, 'writable') : text(lang, 'readOnly')}`), snapshot !== undefined && h(Text, { color: 'subtle' }, `  ${text(lang, 'managedBlock')}: ${snapshot.storage.managedBlock ? '\u2713' : '\u00d7'}`), h(Box, { flexGrow: 1 }), busy !== undefined && h(Text, { color: 'warning' }, busy), busy === undefined && error !== undefined && h(Text, { color: 'error', wrap: 'truncate-end' }, `${text(lang, 'error')}: ${error}`), busy === undefined && error === undefined && notice !== undefined && h(Text, { color: 'success' }, notice)), snapshot !== undefined && h(Box, { flexDirection: 'row', height: 1, flexShrink: 0 }, renderWorkspaceTab('sets', snapshot.sets.length), renderWorkspaceTab('servers', snapshot.servers.length), h(Box, { flexGrow: 1 }), h(Text, { color: 'subtle' }, `w ${text(lang, 'switchWorkspace')}`)), snapshot === undefined
            ? h(Box, { flexGrow: 1, alignItems: 'center', justifyContent: 'center' }, h(Text, { color: error === undefined ? 'subtle' : 'error' }, error ?? text(lang, 'loading')))
            : h(Box, {
                flexDirection: compact ? 'column' : 'row',
                height: bodyHeight,
                flexGrow: 0,
                flexShrink: 1,
                minHeight: 0,
                columnGap: 1,
                rowGap: 1,
            }, renderNav(), renderDetail()), confirm !== undefined && h(Box, { flexDirection: 'column', flexShrink: 0, borderStyle: 'round', borderColor: 'error', paddingX: 1, marginTop: 1 }, h(Text, { bold: true, color: 'error' }, `${text(lang, 'remove')}: ${confirm.label}`), h(Text, null, text(lang, confirm.kind === 'remove-server' ? 'confirmRemoveServer' : 'confirmRemoveSet')), h(Box, { flexDirection: 'row', columnGap: 2 }, h(Box, { borderStyle: 'round', borderColor: 'error', paddingX: 1, onClick: removeConfirmed }, h(Text, { bold: true }, `Enter  ${text(lang, 'confirmAction')}`)), h(Box, { borderStyle: 'round', borderColor: 'subtle', paddingX: 1, onClick: cancelRemoval }, h(Text, { bold: true }, `Esc  ${text(lang, 'cancel')}`)))), confirm === undefined && h(Box, {
            flexDirection: 'column',
            minHeight: editorHelp === undefined ? 2 : 3,
            flexShrink: 0,
            paddingTop: 1,
        }, editorHelp !== undefined && h(Text, { color: 'permission', wrap: 'truncate-end' }, editorHelp), h(Box, { flexDirection: 'row', columnGap: 2, flexWrap: 'wrap' }, serverEditor !== undefined
            ? h(React.Fragment, null, serverEditor.editing !== undefined
                ? h(Text, { color: 'suggestion' }, `←→ ${text(lang, 'moveCursor')}  Backspace ${text(lang, 'deleteCharacter')}  Ctrl+U ${text(lang, 'clearValue')}  Enter ${text(lang, 'back')}  Esc ${text(lang, 'cancel')}`)
                : h(Text, { color: 'suggestion' }, `↑↓ ${text(lang, 'navigate')}  Enter ${text(lang, serverEditorEnterAction)}  Esc ${text(lang, 'cancel')}`))
            : setEditor !== undefined
                ? h(React.Fragment, null, setEditor.memberSearchCursor !== undefined
                    ? h(Text, { color: 'suggestion' }, `←→ ${text(lang, 'moveCursor')}  Backspace ${text(lang, 'deleteCharacter')}  Enter ${text(lang, 'applySearch')}  Esc ${text(lang, 'clearSearch')}`)
                    : setEditor.editing !== undefined
                        ? h(Text, { color: 'suggestion' }, `←→ ${text(lang, 'moveCursor')}  Backspace ${text(lang, 'deleteCharacter')}  Ctrl+U ${text(lang, 'clearValue')}  Enter ${text(lang, 'back')}  Esc ${text(lang, 'cancel')}`)
                        : h(Text, { color: 'suggestion' }, `\u2191\u2193 ${text(lang, 'navigate')}  Enter ${text(lang, setEditorEnterAction)}  / ${text(lang, 'search')}  Esc ${text(lang, setEditor.memberFilter === '' ? 'cancel' : 'clearSearch')}`))
                : navSearchCursor !== undefined
                    ? h(Text, { color: 'suggestion' }, `←→ ${text(lang, 'moveCursor')}  Backspace ${text(lang, 'deleteCharacter')}  Enter ${text(lang, 'applySearch')}  Esc ${text(lang, 'clearSearch')}`)
                    : toolSearchCursor !== undefined
                        ? h(Text, { color: 'suggestion' }, `←→ ${text(lang, 'moveCursor')}  Backspace ${text(lang, 'deleteCharacter')}  Enter ${text(lang, 'applySearch')}  Esc ${text(lang, 'clearSearch')}`)
                        : h(React.Fragment, null, h(Text, { color: focusArea === 'navigation' ? 'suggestion' : 'permission' }, `Tab ${text(lang, 'focus')}: ${text(lang, focusArea === 'navigation' ? 'navigationPane' : 'detailPane')}`), !compact && h(Text, { color: 'subtle' }, `w ${text(lang, 'switchWorkspace')}`), focusArea === 'navigation' && h(Text, { color: 'subtle' }, `\u2191\u2193 ${text(lang, 'navigate')}  / ${text(lang, 'search')}`), focusArea === 'detail' && detailActionsVisible && h(Text, { color: 'suggestion' }, `\u2191\u2193 ${text(lang, 'navigateActions')}  Enter ${text(lang, 'activateAction')}`), focusArea === 'detail' && selected !== undefined && h(Text, { color: 'subtle' }, `PgUp/PgDn ${text(lang, 'scroll')}`), focusArea === 'detail' && selectedServer !== undefined && h(Text, { color: 'subtle' }, `\u2190\u2192 ${text(lang, 'tabs')}`), focusArea === 'detail' && selectedServer !== undefined && tab === 'tools' && h(Text, { color: 'subtle' }, toolDetailOpen
                            ? `\u2191\u2193 ${text(lang, 'toolNav')}`
                            : `\u2191\u2193 ${text(lang, 'toolNav')}  Enter ${text(lang, 'openTool')}  / ${text(lang, 'search')}`), !compact && workspace === 'sets' && h(Text, { color: 'subtle' }, `a ${text(lang, 'createSet')}`), !compact && workspace === 'servers' && h(Text, { color: 'subtle' }, `a ${text(lang, 'createServer')}`), !compact && h(Text, { color: 'subtle' }, `r ${text(lang, 'refresh')}`), h(Text, { color: 'subtle' }, `Esc ${text(lang, navFilter !== '' && focusArea === 'navigation'
                            ? 'clearSearch'
                            : toolDetailOpen || focusArea === 'detail' ? 'back' : 'close')}`)))));
    };
}
//# sourceMappingURL=scene.js.map
import { doctorCheckDetail, doctorCheckLabel, doctorSuggestion, runtimeStateText, sceneText as text, } from './scene-i18n.js';
import { clamp, indexedWindow } from './scene-model.js';
import { SceneSearchInput } from './scene-search-input.js';
export function serverStateGlyph(state) {
    switch (state) {
        case 'connected': return '\u2713';
        case 'starting': return '\u25b6';
        case 'reconnecting': return '\u21bb';
        case 'failed': return '\u2717';
        case 'disabled': return '\u25cb';
        case 'stopped': return '\u00d7';
    }
}
export function serverStateColor(state) {
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
export function renderServerDetailView({ React, ui, lang, server, sets, tab, focusArea, toolIndex, toolDetailOpen, toolFilter, toolSearchCursor, filteredToolIndices, detailScrollHeight, doctor, busy, setToolDetailOpen, setFocusArea, scrollDetailTo, beginToolSearch, openTool, }) {
    const { Box, Text } = ui;
    const h = React.createElement;
    const row = (label, value, color) => h(Box, { flexDirection: 'row', minHeight: 1 }, h(Text, { color: 'subtle' }, `${label}: `), h(Text, { color, wrap: 'wrap' }, value || '-'));
    if (tab === 'overview') {
        const memberships = sets.filter((set) => set.serverIds.includes(server.id));
        const membershipRow = h(Box, { flexDirection: 'row', minHeight: 1, flexWrap: 'wrap' }, h(Text, { color: 'subtle' }, `${text(lang, 'setMembership')}: `), memberships.length === 0
            ? h(Text, { color: 'inactive' }, text(lang, 'noSetMembership'))
            : memberships.flatMap((set, index) => [
                index > 0 ? h(Text, { key: `separator:${set.id}` }, '  ') : null,
                h(Text, { key: set.id, color: set.active ? 'success' : 'inactive' }, `${set.active ? '\u25c6' : '\u25c7'} ${set.name}`),
            ]));
        return h(React.Fragment, null, row(text(lang, 'runtime'), runtimeStateText(lang, server.state), serverStateColor(server.state)), row(text(lang, 'transport'), server.transport), row(text(lang, 'namespace'), server.serverName), row(text(lang, 'endpoint'), server.transport === 'stdio'
            ? [server.command, ...(server.args ?? [])].filter(Boolean).join(' ')
            : server.url ?? '-'), row(text(lang, 'enabled'), yesNo(lang, server.enabled), server.enabled ? 'success' : 'inactive'), membershipRow, row(text(lang, 'tools'), `${server.tools.length} ${text(lang, 'toolCount')}`), server.error !== undefined && h(Box, { marginTop: 1, borderStyle: 'round', borderColor: 'error', paddingX: 1 }, h(Text, { color: 'error', wrap: 'wrap' }, server.error)), h(Box, { marginTop: 1 }, h(Text, { color: 'subtle', wrap: 'wrap' }, text(lang, 'previewLimit'))));
    }
    if (tab === 'tools') {
        if (server.tools.length === 0)
            return h(Text, { color: 'subtle' }, text(lang, 'noTools'));
        const selectedToolIndex = clamp(toolIndex, server.tools.length);
        const tool = server.tools[selectedToolIndex];
        if (!toolDetailOpen) {
            const capacity = Math.max(1, detailScrollHeight - 3);
            const selectedPosition = Math.max(0, filteredToolIndices.indexOf(selectedToolIndex));
            const visible = indexedWindow(filteredToolIndices, selectedPosition, capacity);
            return h(React.Fragment, null, h(Box, { flexDirection: 'row', width: '100%', height: 1 }, h(Text, { bold: true, color: 'permission' }, `${text(lang, 'toolList')}  ${filteredToolIndices.length}/${server.tools.length}`)), h(SceneSearchInput, {
                React,
                ui,
                query: toolFilter,
                cursor: toolSearchCursor,
                beginSearch: beginToolSearch,
            }), filteredToolIndices.length === 0 && h(Text, { color: 'warning' }, text(lang, 'noMatches')), ...visible.items.map((index) => {
                const item = server.tools[index];
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
        }, h(Text, { bold: true, color: 'permission' }, `\u2190 ${text(lang, 'backToTools')}`)), h(Box, { height: 1 }), h(Text, { bold: true, color: 'suggestion' }, `${selectedToolIndex + 1}/${server.tools.length}  ${tool.name}`), h(Box, { marginTop: 1, flexDirection: 'column' }, h(Text, { bold: true, color: 'permission' }, text(lang, 'description')), ...descriptionLines.map((line, index) => h(Text, { key: `description:${index}`, color: 'subtle', wrap: 'wrap' }, line || ' '))), h(Box, { marginTop: 1, flexDirection: 'column' }, h(Text, { bold: true, color: 'permission' }, text(lang, 'schema')), ...schemaLines.map((line, index) => h(Text, { key: `schema:${index}`, color: 'subtle', wrap: 'wrap' }, line || ' '))));
    }
    if (tab === 'doctor') {
        if (busy === text(lang, 'doctorRunning'))
            return h(Text, { color: 'warning' }, text(lang, 'doctorRunning'));
        if (doctor === undefined)
            return h(Text, { color: 'subtle' }, text(lang, 'runDoctor'));
        return h(React.Fragment, null, ...doctor.checks.map((check) => h(Box, { key: check.id, flexDirection: 'column', marginBottom: 1 }, h(Box, { flexDirection: 'row' }, h(Text, { color: check.state === 'pass' ? 'success' : check.state === 'warn' ? 'warning' : check.state === 'skip' ? 'subtle' : 'error' }, `${check.state === 'pass' ? '\u2713' : check.state === 'warn' ? '!' : check.state === 'skip' ? '\u2013' : '\u2717'} `), h(Text, { bold: true }, doctorCheckLabel(lang, check.id))), h(Text, { color: 'subtle', wrap: 'wrap' }, doctorCheckDetail(lang, check)), check.suggestion !== undefined && h(Box, { flexDirection: 'row', marginTop: 1, paddingLeft: 2 }, h(Text, { color: 'warning', wrap: 'wrap' }, `${text(lang, 'suggestion')}: ${doctorSuggestion(lang, check.suggestion)}`)))));
    }
    const entries = (value) => Object.keys(value ?? {}).join(', ') || '-';
    return h(React.Fragment, null, server.transport === 'stdio'
        ? h(React.Fragment, null, row(text(lang, 'command'), server.command ?? '-'), row(text(lang, 'arguments'), (server.args ?? []).join(' ') || '-'), row(text(lang, 'workingDirectory'), server.cwd ?? '-'), row(text(lang, 'environment'), entries(server.env)), row(text(lang, 'credentialRefs'), Object.values(server.secretEnv ?? {}).map((entry) => entry.ref).join(', ') || '-'))
        : h(React.Fragment, null, row(text(lang, 'endpoint'), server.url ?? '-'), row(text(lang, 'headers'), entries(server.headers)), row(text(lang, 'credentialRefs'), Object.values(server.secretHeaders ?? {}).map((entry) => entry.ref).join(', ') || '-')), row(text(lang, 'timeout'), `${server.toolCallTimeoutMs ?? 60_000} ms`), row(text(lang, 'failStartup'), yesNo(lang, server.failOnStartupError ?? false)), row(text(lang, 'reconnectPolicy'), server.reconnect?.enabled === false
        ? text(lang, 'disabled')
        : `${server.reconnect?.initialDelayMs ?? 500} -> ${server.reconnect?.maxDelayMs ?? 30_000} ms / ${server.reconnect?.maxAttempts ?? 10}`));
}
//# sourceMappingURL=scene-server-detail.js.map
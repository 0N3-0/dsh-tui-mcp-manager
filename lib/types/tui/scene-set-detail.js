import { runtimeStateText, sceneText as text, } from './scene-i18n.js';
import { serverStateColor, serverStateGlyph } from './scene-server-detail.js';
export function renderSetEditorView({ React, ui, lang, snapshot, editor, rows, activateRow, }) {
    const { Box, Text } = ui;
    const h = React.createElement;
    return h(React.Fragment, null, h(Text, { color: 'subtle', wrap: 'wrap' }, text(lang, 'setEditorHint')), h(Text, { color: 'permission' }, `${text(lang, 'setMembers')}: ${editor.draft.serverIds.length}/${snapshot?.servers.length ?? 0}`), editor.error !== undefined && h(Box, { marginTop: 1, borderStyle: 'round', borderColor: 'error', paddingX: 1 }, h(Text, { color: 'error', wrap: 'wrap' }, editor.error)), h(Box, { height: 1 }), ...rows.map((item, index) => {
        const focused = index === editor.selected;
        const common = {
            key: item.kind === 'field' ? `field:${item.field}` : item.kind === 'member' ? `member:${item.server.id}` : item.kind,
            flexDirection: 'row',
            minHeight: 1,
            paddingX: 1,
            onClick: () => activateRow(index),
        };
        if (item.kind === 'field') {
            const value = editor.draft[item.field];
            const editing = editor.editing === item.field;
            return h(Box, common, h(Text, { color: focused ? undefined : 'subtle' }, focused ? '\u276f ' : '  '), h(Text, { color: 'permission' }, `${text(lang, item.field === 'id' ? 'setId' : 'setName')}: `), h(Text, { bold: focused, color: item.editable ? undefined : 'subtle', wrap: 'truncate-end' }, `${value || text(lang, 'valueEmpty')}${editing ? '\u258d' : ''}`), h(Box, { flexGrow: 1 }), item.editable && h(Text, { color: 'subtle' }, text(lang, 'editValue')));
        }
        if (item.kind === 'member') {
            const member = editor.draft.serverIds.includes(item.server.id);
            return h(Box, common, h(Text, { color: focused ? undefined : 'subtle' }, focused ? '\u276f ' : '  '), h(Text, { color: member ? 'success' : 'inactive' }, `${member ? '\u2713' : '\u25cb'} `), h(Text, { bold: focused, wrap: 'truncate-end' }, item.server.name), h(Box, { flexGrow: 1 }), h(Text, { color: serverStateColor(item.server.state) }, runtimeStateText(lang, item.server.state)), h(Text, { color: 'subtle' }, `  ${item.server.tools.length}`));
        }
        return h(Box, common, h(Text, { color: focused ? undefined : 'subtle' }, focused ? '\u276f ' : '  '), h(Text, { bold: focused, color: item.kind === 'save' ? 'success' : 'inactive' }, `${item.kind === 'save' ? '\u2713' : '\u00d7'} ${text(lang, item.kind)}`));
    }));
}
export function renderSetDetailView({ React, ui, lang, snapshot, set, }) {
    const { Box, Text } = ui;
    const h = React.createElement;
    const row = (label, value, color) => h(Box, { flexDirection: 'row', minHeight: 1 }, h(Text, { color: 'subtle' }, `${label}: `), h(Text, { color, wrap: 'wrap' }, value || '-'));
    const members = set.serverIds.map((id) => snapshot?.servers.find((server) => server.id === id));
    return h(React.Fragment, null, row(text(lang, 'active'), text(lang, set.active ? 'active' : 'inactive'), set.active ? 'success' : 'inactive'), row(text(lang, 'members'), String(set.serverIds.length)), h(Box, { marginTop: 1, flexDirection: 'column' }, ...members.map((server, index) => h(Box, { key: set.serverIds[index], flexDirection: 'row' }, h(Text, { color: server === undefined ? 'error' : serverStateColor(server.state) }, server === undefined ? '? ' : `${serverStateGlyph(server.state)} `), h(Text, null, server?.name ?? set.serverIds[index]), h(Box, { flexGrow: 1 }), h(Text, { color: 'subtle' }, server === undefined ? '' : String(server.tools.length))))), h(Box, { marginTop: 1 }, h(Text, { color: 'subtle' }, text(lang, 'setHint'))));
}
//# sourceMappingURL=scene-set-detail.js.map
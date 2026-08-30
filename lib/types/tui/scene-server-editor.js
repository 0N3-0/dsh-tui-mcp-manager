import { sceneText as text } from './scene-i18n.js';
import { terminalTextWidth, textCursorSegments, truncateTerminalText } from './scene-model.js';
function serverFieldLabel(lang, field) {
    switch (field) {
        case 'id': return text(lang, 'serverId');
        case 'displayName': return text(lang, 'displayName');
        case 'serverName': return text(lang, 'serverName');
        case 'command': return text(lang, 'command');
        case 'args': return text(lang, 'arguments');
        case 'cwd': return text(lang, 'workingDirectory');
        case 'env': return text(lang, 'environment');
        case 'secretEnv': return text(lang, 'secretEnv');
        case 'url': return text(lang, 'endpoint');
        case 'headers': return text(lang, 'headers');
        case 'secretHeaders': return text(lang, 'secretHeaders');
        case 'toolCallTimeoutMs': return text(lang, 'timeout');
        case 'reconnectInitialDelayMs': return text(lang, 'reconnectInitialDelay');
        case 'reconnectMaxDelayMs': return text(lang, 'reconnectMaxDelay');
        case 'reconnectMaxAttempts': return text(lang, 'reconnectMaxAttempts');
    }
}
function serverFieldRequired(field) {
    return field === 'id'
        || field === 'serverName'
        || field === 'command'
        || field === 'url'
        || field === 'toolCallTimeoutMs'
        || field === 'reconnectInitialDelayMs'
        || field === 'reconnectMaxDelayMs'
        || field === 'reconnectMaxAttempts';
}
function serverFieldHelpKey(field) {
    switch (field) {
        case 'id': return 'helpServerId';
        case 'displayName': return 'helpDisplayName';
        case 'serverName': return 'helpServerName';
        case 'command': return 'helpCommand';
        case 'args': return 'helpArguments';
        case 'cwd': return 'helpWorkingDirectory';
        case 'env': return 'helpEnvironment';
        case 'secretEnv': return 'helpSecretEnv';
        case 'url': return 'helpEndpoint';
        case 'headers': return 'helpHeaders';
        case 'secretHeaders': return 'helpSecretHeaders';
        case 'toolCallTimeoutMs': return 'helpTimeout';
        case 'reconnectInitialDelayMs': return 'helpReconnectInitialDelay';
        case 'reconnectMaxDelayMs': return 'helpReconnectMaxDelay';
        case 'reconnectMaxAttempts': return 'helpReconnectMaxAttempts';
    }
}
export function serverEditorSelectionHelp(lang, editor, rows) {
    const row = rows[editor.selected];
    if (row?.kind === 'field')
        return text(lang, serverFieldHelpKey(row.field));
    if (row?.kind === 'transport')
        return text(lang, 'helpTransport');
    if (row?.kind === 'boolean') {
        return text(lang, row.field === 'failOnStartupError' ? 'helpFailStartup' : 'helpReconnectEnabled');
    }
    if (row?.kind === 'credential')
        return text(lang, 'helpCredentialValue').replace('{ref}', row.ref);
    return text(lang, row?.kind === 'save' ? 'helpSave' : 'helpCancel');
}
function isCredentialConfigured(snapshot, ref) {
    return (snapshot?.servers ?? []).some((server) => {
        const entries = [
            ...Object.values(server.secretEnv ?? {}),
            ...Object.values(server.secretHeaders ?? {}),
        ];
        return entries.some((entry) => entry.ref === ref && entry.credential.configured);
    });
}
export function renderServerEditorView({ React, ui, lang, snapshot, editor, rows, rowWidth, activateRow, }) {
    const { Box, Text } = ui;
    const h = React.createElement;
    return h(React.Fragment, null, h(Text, { color: 'subtle', wrap: 'wrap' }, text(lang, 'serverEditorHint')), editor.error !== undefined && h(Box, { marginTop: 1, borderStyle: 'round', borderColor: 'error', paddingX: 1 }, h(Text, { color: 'error', wrap: 'wrap' }, editor.error)), h(Box, { height: 1 }), ...rows.map((item, index) => {
        const focused = index === editor.selected;
        const key = item.kind === 'field'
            ? `field:${item.field}`
            : item.kind === 'boolean'
                ? `boolean:${item.field}`
                : item.kind === 'credential' ? `credential:${item.ref}` : item.kind;
        const common = {
            key,
            flexDirection: 'row',
            minHeight: 1,
            paddingX: 1,
            onClick: () => activateRow(index),
        };
        const marker = h(Text, { color: focused ? undefined : 'subtle' }, focused ? '❯ ' : '  ');
        if (item.kind === 'field') {
            const editing = editor.editing?.kind === 'field' && editor.editing.field === item.field
                ? editor.editing
                : undefined;
            const value = editor.draft[item.field];
            const required = serverFieldRequired(item.field);
            const label = `${serverFieldLabel(lang, item.field)}: `;
            const action = text(lang, 'editValue');
            const valueWidth = Math.max(8, rowWidth - terminalTextWidth(label) - 4
                - (editing === undefined && item.editable ? terminalTextWidth(action) + 1 : 0));
            const cursor = editing === undefined
                ? undefined
                : textCursorSegments(value, editing.cursor, valueWidth);
            return h(Box, common, marker, h(Text, { color: required && value.trim() === '' ? 'error' : 'warning' }, required ? '* ' : '  '), h(Text, { color: 'permission' }, label), h(Text, {
                bold: focused,
                color: !item.editable ? 'subtle' : required && value.trim() === '' ? 'error' : undefined,
                wrap: 'truncate-end',
            }, editing === undefined
                ? truncateTerminalText(value || text(lang, 'valueEmpty'), valueWidth)
                : h(React.Fragment, null, cursor?.before, h(Text, { inverse: true }, cursor?.cursor), cursor?.after)), h(Box, { flexGrow: 1 }), editing === undefined && item.editable && h(Text, { color: 'subtle' }, action));
        }
        if (item.kind === 'transport') {
            return h(Box, common, marker, h(Text, null, '  '), h(Text, { color: 'permission' }, `${text(lang, 'transport')}: `), h(Text, { bold: focused }, editor.draft.transport), h(Box, { flexGrow: 1 }), h(Text, { color: 'subtle' }, text(lang, 'toggle')));
        }
        if (item.kind === 'boolean') {
            const enabled = editor.draft[item.field];
            return h(Box, common, marker, h(Text, null, '  '), h(Text, { color: 'permission' }, `${text(lang, item.field === 'failOnStartupError' ? 'failStartup' : 'reconnectEnabled')}: `), h(Text, { color: enabled ? 'success' : 'inactive', bold: focused }, text(lang, enabled ? 'enabled' : 'disabled')), h(Box, { flexGrow: 1 }), h(Text, { color: 'subtle' }, text(lang, 'toggleOption')));
        }
        if (item.kind === 'credential') {
            const editing = editor.editing?.kind === 'credential' && editor.editing.ref === item.ref
                ? editor.editing
                : undefined;
            const pending = editor.draft.credentialValues[item.ref];
            const status = pending !== undefined
                ? text(lang, 'credentialPending')
                : text(lang, isCredentialConfigured(snapshot, item.ref) ? 'credentialConfigured' : 'credentialMissing');
            const label = `${text(lang, 'credentialValue')} ${item.ref}: `;
            const valueWidth = Math.max(8, rowWidth - terminalTextWidth(label) - 4);
            const cursor = editing === undefined
                ? undefined
                : textCursorSegments(pending ?? '', editing.cursor, valueWidth, true);
            return h(Box, common, marker, h(Text, { color: 'warning' }, '* '), h(Text, { color: 'permission' }, label), h(Text, { color: pending !== undefined ? 'warning' : 'subtle', bold: focused }, editing === undefined
                ? status
                : h(React.Fragment, null, cursor?.before, h(Text, { inverse: true }, cursor?.cursor), cursor?.after)));
        }
        return h(Box, common, marker, h(Text, { bold: focused, color: item.kind === 'save' ? 'success' : 'inactive' }, `${item.kind === 'save' ? '✓' : '×'} ${text(lang, item.kind)}`));
    }));
}
//# sourceMappingURL=scene-server-editor.js.map
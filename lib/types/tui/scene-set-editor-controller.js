import { sceneText as text } from './scene-i18n.js';
import { clamp, clampTextCursor, insertAtTextCursor, matchesSearch, nextSetId, removeAtTextCursor, removeBeforeTextCursor, textCursorEnd, } from './scene-model.js';
export function setEditorRowsFor(editor, servers) {
    if (editor === undefined)
        return [];
    const matchingServers = servers.filter((server) => matchesSearch(editor.memberFilter, server.name, server.id, server.serverName));
    return [
        { kind: 'field', field: 'id', editable: editor.mode === 'create' },
        { kind: 'field', field: 'name', editable: true },
        { kind: 'boolean', field: 'active' },
        { kind: 'search' },
        ...matchingServers.map((server) => ({ kind: 'member', server })),
        { kind: 'save' },
        { kind: 'cancel' },
    ];
}
export function useSetEditorController({ React, manager, lang, snapshot, selectedSet, busy, ensureWritable, mutate, setSelectedSetId, setFocusArea, scrollDetailBy, scrollDetailTo, isMounted, }) {
    const [editor, setEditor] = React.useState();
    const rows = setEditorRowsFor(editor, snapshot?.servers ?? []);
    const openCreate = () => {
        if (snapshot === undefined || busy !== undefined || !ensureWritable())
            return;
        setEditor({
            mode: 'create',
            draft: { id: nextSetId(snapshot), name: '', serverIds: [], active: false },
            selected: 0,
            memberFilter: '',
        });
        setFocusArea('detail');
        scrollDetailTo(0);
    };
    const openEdit = () => {
        if (selectedSet === undefined || busy !== undefined || !ensureWritable())
            return;
        setEditor({
            mode: 'edit',
            draft: {
                id: selectedSet.id,
                name: selectedSet.name,
                serverIds: [...selectedSet.serverIds],
                active: selectedSet.active,
            },
            selected: 1,
            memberFilter: '',
        });
        setFocusArea('detail');
        scrollDetailTo(0);
    };
    const close = () => {
        setEditor(undefined);
    };
    const moveSelection = (delta) => {
        setEditor((current) => {
            if (current === undefined)
                return current;
            const selected = clamp(current.selected + delta, rows.length);
            scrollDetailTo(selected);
            return { ...current, selected, error: undefined };
        });
    };
    const save = (current) => {
        const record = {
            id: current.draft.id.trim(),
            name: current.draft.name.trim(),
            serverIds: [...current.draft.serverIds],
        };
        if (!/^[a-z0-9][a-z0-9._-]{0,63}$/.test(record.id)) {
            const selected = rows.findIndex((row) => row.kind === 'field' && row.field === 'id');
            scrollDetailTo(selected);
            setEditor({ ...current, selected, error: text(lang, 'invalidSetId') });
            return;
        }
        if (current.mode === 'create' && snapshot?.sets.some((set) => set.id === record.id)) {
            const selected = rows.findIndex((row) => row.kind === 'field' && row.field === 'id');
            scrollDetailTo(selected);
            setEditor({ ...current, selected, error: text(lang, 'duplicateSetId') });
            return;
        }
        if (record.name.length === 0 || Array.from(record.name).length > 80) {
            const selected = rows.findIndex((row) => row.kind === 'field' && row.field === 'name');
            scrollDetailTo(selected);
            setEditor({ ...current, selected, error: text(lang, 'invalidSetName') });
            return;
        }
        void mutate(() => manager.invoke('upsertSet', { set: record, active: current.draft.active }), text(lang, 'save'), text(lang, 'updated')).then((saved) => {
            if (!saved || !isMounted())
                return;
            setSelectedSetId(record.id);
            setEditor(undefined);
        });
    };
    const activateRow = (index) => {
        if (editor === undefined || busy !== undefined)
            return;
        const row = rows[index];
        if (row === undefined)
            return;
        if (row.kind === 'field') {
            if (row.editable) {
                setEditor({
                    ...editor,
                    selected: index,
                    editing: { field: row.field, cursor: textCursorEnd(editor.draft[row.field]) },
                    error: undefined,
                });
            }
            return;
        }
        if (row.kind === 'member') {
            const members = new Set(editor.draft.serverIds);
            if (members.has(row.server.id))
                members.delete(row.server.id);
            else
                members.add(row.server.id);
            setEditor({
                ...editor,
                selected: index,
                error: undefined,
                draft: { ...editor.draft, serverIds: [...members] },
            });
            return;
        }
        if (row.kind === 'search') {
            setEditor({
                ...editor,
                selected: index,
                memberSearchCursor: textCursorEnd(editor.memberFilter),
                error: undefined,
            });
            return;
        }
        if (row.kind === 'boolean') {
            setEditor({
                ...editor,
                selected: index,
                error: undefined,
                draft: { ...editor.draft, active: !editor.draft.active },
            });
            return;
        }
        if (row.kind === 'cancel') {
            close();
            return;
        }
        save(editor);
    };
    const handleInput = (input, key) => {
        if (editor === undefined)
            return false;
        const lower = input.toLowerCase();
        const searchIndex = rows.findIndex((row) => row.kind === 'search');
        if (editor.memberSearchCursor !== undefined) {
            const value = editor.memberFilter;
            if (key.escape) {
                setEditor({
                    ...editor,
                    selected: searchIndex,
                    memberFilter: '',
                    memberSearchCursor: undefined,
                    error: undefined,
                });
                scrollDetailTo(searchIndex);
                return true;
            }
            if (key.return) {
                setEditor({ ...editor, selected: searchIndex, memberSearchCursor: undefined, error: undefined });
                scrollDetailTo(searchIndex);
                return true;
            }
            if (key.leftArrow || key.rightArrow || key.home || key.end) {
                const cursor = key.home
                    ? 0
                    : key.end
                        ? textCursorEnd(value)
                        : clampTextCursor(value, editor.memberSearchCursor + (key.leftArrow ? -1 : 1));
                setEditor({ ...editor, memberSearchCursor: cursor, error: undefined });
                return true;
            }
            if (key.ctrl && lower === 'u') {
                setEditor({ ...editor, memberFilter: '', memberSearchCursor: 0, error: undefined });
                return true;
            }
            if (key.backspace || key.delete) {
                const update = key.backspace
                    ? removeBeforeTextCursor(value, editor.memberSearchCursor)
                    : removeAtTextCursor(value, editor.memberSearchCursor);
                setEditor({
                    ...editor,
                    memberFilter: update.value,
                    memberSearchCursor: update.cursor,
                    error: undefined,
                });
                return true;
            }
            if (!key.ctrl && !key.meta && !key.super) {
                const printable = input.replace(/[\u0000-\u001f\u007f]/g, '');
                if (printable !== '') {
                    const update = insertAtTextCursor(value, editor.memberSearchCursor, printable, 80);
                    setEditor({
                        ...editor,
                        memberFilter: update.value,
                        memberSearchCursor: update.cursor,
                        error: undefined,
                    });
                }
            }
            return true;
        }
        if (editor.editing !== undefined) {
            const editing = editor.editing;
            const value = editor.draft[editing.field];
            if (key.escape) {
                close();
                return true;
            }
            if (key.return) {
                setEditor({ ...editor, editing: undefined, error: undefined });
                return true;
            }
            if (key.leftArrow || key.rightArrow || key.home || key.end) {
                const cursor = key.home
                    ? 0
                    : key.end
                        ? textCursorEnd(value)
                        : clampTextCursor(value, editing.cursor + (key.leftArrow ? -1 : 1));
                setEditor({ ...editor, editing: { ...editing, cursor }, error: undefined });
                return true;
            }
            if (key.ctrl && lower === 'u') {
                setEditor({
                    ...editor,
                    editing: { ...editing, cursor: 0 },
                    error: undefined,
                    draft: { ...editor.draft, [editing.field]: '' },
                });
                return true;
            }
            if (key.backspace || key.delete) {
                const update = key.backspace
                    ? removeBeforeTextCursor(value, editing.cursor)
                    : removeAtTextCursor(value, editing.cursor);
                setEditor({
                    ...editor,
                    editing: { ...editing, cursor: update.cursor },
                    error: undefined,
                    draft: { ...editor.draft, [editing.field]: update.value },
                });
                return true;
            }
            if (!key.ctrl && !key.meta && !key.super) {
                const printable = input.replace(/[\u0000-\u001f\u007f]/g, '');
                if (printable !== '') {
                    const limit = editing.field === 'id' ? 64 : 80;
                    const update = insertAtTextCursor(value, editing.cursor, printable, limit);
                    setEditor({
                        ...editor,
                        editing: { ...editing, cursor: update.cursor },
                        error: undefined,
                        draft: { ...editor.draft, [editing.field]: update.value },
                    });
                }
            }
            return true;
        }
        if (input === '/' && !key.ctrl && !key.meta && !key.super) {
            setEditor({
                ...editor,
                selected: searchIndex,
                memberSearchCursor: textCursorEnd(editor.memberFilter),
                error: undefined,
            });
            scrollDetailTo(searchIndex);
        }
        else if (key.escape && editor.memberFilter !== '') {
            setEditor({
                ...editor,
                selected: searchIndex,
                memberFilter: '',
                error: undefined,
            });
            scrollDetailTo(searchIndex);
        }
        else if (key.escape)
            close();
        else if (key.upArrow)
            moveSelection(-1);
        else if (key.downArrow)
            moveSelection(1);
        else if (key.return)
            activateRow(editor.selected);
        else if (key.pageUp || key.pageDown || key.wheelUp || key.wheelDown) {
            scrollDetailBy(key.pageUp || key.wheelUp ? -5 : 5);
        }
        return true;
    };
    return {
        editor,
        rows,
        openCreate,
        openEdit,
        activateRow,
        handleInput,
    };
}
//# sourceMappingURL=scene-set-editor-controller.js.map
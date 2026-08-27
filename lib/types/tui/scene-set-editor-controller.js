import { sceneText as text } from './scene-i18n.js';
import { clamp, nextSetId, removeLastCodePoint, } from './scene-model.js';
export function setEditorRowsFor(editor, servers) {
    if (editor === undefined)
        return [];
    return [
        { kind: 'field', field: 'id', editable: editor.mode === 'create' },
        { kind: 'field', field: 'name', editable: true },
        ...servers.map((server) => ({ kind: 'member', server })),
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
            draft: { id: nextSetId(snapshot), name: '', serverIds: [] },
            selected: 0,
        });
        setFocusArea('detail');
        scrollDetailTo(0);
    };
    const openEdit = () => {
        if (selectedSet === undefined || busy !== undefined || !ensureWritable())
            return;
        setEditor({
            mode: 'edit',
            draft: { id: selectedSet.id, name: selectedSet.name, serverIds: [...selectedSet.serverIds] },
            selected: 1,
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
    const save = (current, index) => {
        const record = {
            id: current.draft.id.trim(),
            name: current.draft.name.trim(),
            serverIds: [...current.draft.serverIds],
        };
        if (!/^[a-z0-9][a-z0-9._-]{0,63}$/.test(record.id)) {
            setEditor({ ...current, selected: index, error: text(lang, 'invalidSetId') });
            return;
        }
        if (current.mode === 'create' && snapshot?.sets.some((set) => set.id === record.id)) {
            setEditor({ ...current, selected: index, error: text(lang, 'duplicateSetId') });
            return;
        }
        if (record.name.length === 0 || Array.from(record.name).length > 80) {
            setEditor({ ...current, selected: index, error: text(lang, 'invalidSetName') });
            return;
        }
        void mutate(() => manager.invoke('upsertSet', { set: record }), text(lang, 'save'), text(lang, 'updated')).then((saved) => {
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
            if (row.editable)
                setEditor({ ...editor, selected: index, editing: row.field, error: undefined });
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
        if (row.kind === 'cancel') {
            close();
            return;
        }
        save(editor, index);
    };
    const handleInput = (input, key) => {
        if (editor === undefined)
            return false;
        if (editor.editing !== undefined) {
            if (key.escape) {
                close();
                return true;
            }
            if (key.return) {
                setEditor({ ...editor, editing: undefined, error: undefined });
                return true;
            }
            if (key.backspace) {
                const field = editor.editing;
                setEditor({
                    ...editor,
                    error: undefined,
                    draft: { ...editor.draft, [field]: removeLastCodePoint(editor.draft[field]) },
                });
                return true;
            }
            if (!key.ctrl && !key.meta && !key.super) {
                const printable = input.replace(/[\u0000-\u001f\u007f]/g, '');
                if (printable !== '') {
                    const field = editor.editing;
                    const limit = field === 'id' ? 64 : 80;
                    const value = Array.from(`${editor.draft[field]}${printable}`).slice(0, limit).join('');
                    setEditor({
                        ...editor,
                        error: undefined,
                        draft: { ...editor.draft, [field]: value },
                    });
                }
            }
            return true;
        }
        if (key.escape)
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
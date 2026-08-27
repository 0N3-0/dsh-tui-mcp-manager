import type { TuiSceneProps } from '@deepseek-harness-tui/dsh-tui/scenes';
import type { McpManagerService } from '../host/manager.js';
import type { McpManagerSnapshot, McpServerView, McpSetView } from '../host/types.js';
import { type SceneLanguage } from './scene-i18n.js';
import { type FocusArea, type SetEditorRow, type SetEditorState } from './scene-model.js';
type InputKey = Parameters<Parameters<TuiSceneProps['ui']['useInput']>[0]>[1];
interface SetEditorControllerOptions {
    React: TuiSceneProps['React'];
    manager: McpManagerService;
    lang: SceneLanguage;
    snapshot: McpManagerSnapshot | undefined;
    selectedSet: McpSetView | undefined;
    busy: string | undefined;
    ensureWritable(): boolean;
    mutate(action: () => Promise<McpManagerSnapshot>, pending: string, success: string): Promise<boolean>;
    setSelectedSetId(id: string): void;
    setFocusArea(area: FocusArea): void;
    scrollDetailBy(delta: number): void;
    scrollDetailTo(offset: number): void;
    isMounted(): boolean;
}
export declare function setEditorRowsFor(editor: SetEditorState | undefined, servers: readonly McpServerView[]): SetEditorRow[];
export declare function useSetEditorController({ React, manager, lang, snapshot, selectedSet, busy, ensureWritable, mutate, setSelectedSetId, setFocusArea, scrollDetailBy, scrollDetailTo, isMounted, }: SetEditorControllerOptions): {
    editor: any;
    rows: SetEditorRow[];
    openCreate: () => void;
    openEdit: () => void;
    activateRow: (index: number) => void;
    handleInput: (input: string, key: InputKey) => boolean;
};
export {};
//# sourceMappingURL=scene-set-editor-controller.d.ts.map
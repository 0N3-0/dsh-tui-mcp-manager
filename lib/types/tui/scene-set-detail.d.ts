import type { TuiSceneProps } from '@deepseek-harness-tui/dsh-tui/scenes';
import type { McpManagerSnapshot, McpSetView } from '../host/types.js';
import { type SceneLanguage } from './scene-i18n.js';
import type { SetEditorRow, SetEditorState } from './scene-model.js';
interface SetEditorViewProps {
    React: TuiSceneProps['React'];
    ui: TuiSceneProps['ui'];
    lang: SceneLanguage;
    snapshot: McpManagerSnapshot | undefined;
    editor: SetEditorState;
    rows: readonly SetEditorRow[];
    activateRow(index: number): void;
}
interface SetDetailViewProps {
    React: TuiSceneProps['React'];
    ui: TuiSceneProps['ui'];
    lang: SceneLanguage;
    snapshot: McpManagerSnapshot | undefined;
    set: McpSetView;
}
export declare function renderSetEditorView({ React, ui, lang, snapshot, editor, rows, activateRow, }: SetEditorViewProps): any;
export declare function renderSetDetailView({ React, ui, lang, snapshot, set, }: SetDetailViewProps): any;
export {};
//# sourceMappingURL=scene-set-detail.d.ts.map
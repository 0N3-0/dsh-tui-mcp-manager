import type { TuiSceneProps } from '@deepseek-harness-tui/dsh-tui/scenes';
import type { McpManagerSnapshot, McpSetView } from '../host/types.js';
import { type SceneLanguage } from './scene-i18n.js';
import { type SetEditorRow, type SetEditorState } from './scene-model.js';
interface SetEditorViewProps {
    React: TuiSceneProps['React'];
    ui: TuiSceneProps['ui'];
    lang: SceneLanguage;
    snapshot: McpManagerSnapshot | undefined;
    editor: SetEditorState;
    rows: readonly SetEditorRow[];
    rowWidth: number;
    activateRow(index: number): void;
}
interface SetDetailViewProps {
    React: TuiSceneProps['React'];
    ui: TuiSceneProps['ui'];
    lang: SceneLanguage;
    snapshot: McpManagerSnapshot | undefined;
    set: McpSetView;
    focusArea: 'navigation' | 'detail';
    selectedMemberIndex: number;
    activateMember(index: number): void;
}
export declare function setEditorSelectionHelp(lang: SceneLanguage, editor: SetEditorState, rows: readonly SetEditorRow[]): string;
export declare function renderSetEditorView({ React, ui, lang, snapshot, editor, rows, rowWidth, activateRow, }: SetEditorViewProps): any;
export declare function renderSetDetailView({ React, ui, lang, snapshot, set, focusArea, selectedMemberIndex, activateMember, }: SetDetailViewProps): any;
export {};
//# sourceMappingURL=scene-set-detail.d.ts.map
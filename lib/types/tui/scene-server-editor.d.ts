import type { TuiSceneProps } from '@deepseek-harness-tui/dsh-tui/scenes';
import type { McpManagerSnapshot } from '../host/types.js';
import { type SceneLanguage } from './scene-i18n.js';
import type { ServerEditorRow, ServerEditorState } from './scene-model.js';
interface ServerEditorViewProps {
    React: TuiSceneProps['React'];
    ui: TuiSceneProps['ui'];
    lang: SceneLanguage;
    snapshot: McpManagerSnapshot | undefined;
    editor: ServerEditorState;
    rows: readonly ServerEditorRow[];
    activateRow(index: number): void;
}
export declare function renderServerEditorView({ React, ui, lang, snapshot, editor, rows, activateRow, }: ServerEditorViewProps): any;
export {};
//# sourceMappingURL=scene-server-editor.d.ts.map
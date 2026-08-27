import type { TuiSceneProps } from '@deepseek-harness-tui/dsh-tui/scenes';
import type { McpManagerService } from '../host/manager.js';
import type { McpManagerSnapshot, McpServerView } from '../host/types.js';
import { type CredentialProviderFace } from './credential-provider.js';
import { type SceneLanguage } from './scene-i18n.js';
import { type FocusArea, type ServerEditorRow, type ServerEditorState, type Workspace } from './scene-model.js';
import { type ServerFormIntent } from './server-form-model.js';
type InputKey = Parameters<Parameters<TuiSceneProps['ui']['useInput']>[0]>[1];
interface ServerEditorControllerOptions {
    React: TuiSceneProps['React'];
    manager: McpManagerService;
    credentials?: CredentialProviderFace;
    lang: SceneLanguage;
    snapshot: McpManagerSnapshot | undefined;
    selectedServer: McpServerView | undefined;
    busy: string | undefined;
    ensureWritable(): boolean;
    mutate(action: () => Promise<McpManagerSnapshot>, pending: string, success: string): Promise<boolean>;
    setWorkspace(workspace: Workspace): void;
    setSelectedServerId(id: string): void;
    setFocusArea(area: FocusArea): void;
    scrollDetailBy(delta: number): void;
    scrollDetailTo(offset: number): void;
    isMounted(): boolean;
}
export declare function serverEditorRowsFor(editor: ServerEditorState | undefined): ServerEditorRow[];
export declare function useServerEditorController({ React, manager, credentials, lang, snapshot, selectedServer, busy, ensureWritable, mutate, setWorkspace, setSelectedServerId, setFocusArea, scrollDetailBy, scrollDetailTo, isMounted, }: ServerEditorControllerOptions): {
    editor: any;
    rows: ServerEditorRow[];
    open: (intent: ServerFormIntent) => void;
    activateRow: (index: number) => void;
    handleInput: (input: string, key: InputKey) => boolean;
};
export {};
//# sourceMappingURL=scene-server-editor-controller.d.ts.map
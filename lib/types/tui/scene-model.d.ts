import type { ManagedSetRecord, McpManagerSnapshot, McpServerView, McpSetView } from '../host/types.js';
import type { ServerFormDraft, ServerFormIntent } from './server-form-model.js';
export type SceneTab = 'overview' | 'tools' | 'doctor' | 'config';
export type Workspace = 'servers' | 'sets';
export type FocusArea = 'navigation' | 'detail';
export type NavItem = {
    kind: 'server';
    key: string;
    server: McpServerView;
} | {
    kind: 'set';
    key: string;
    set: McpSetView;
};
export type ConfirmAction = {
    kind: 'remove-server';
    id: string;
    label: string;
} | {
    kind: 'remove-set';
    id: string;
    label: string;
};
export type SetEditorRow = {
    kind: 'field';
    field: 'id' | 'name';
    editable: boolean;
} | {
    kind: 'member';
    server: McpServerView;
} | {
    kind: 'save';
} | {
    kind: 'cancel';
};
export interface SetEditorState {
    mode: 'create' | 'edit';
    draft: ManagedSetRecord;
    selected: number;
    editing?: 'id' | 'name';
    error?: string;
}
export type ServerTextField = 'id' | 'displayName' | 'serverName' | 'command' | 'args' | 'cwd' | 'env' | 'secretEnv' | 'url' | 'headers' | 'secretHeaders' | 'toolCallTimeoutMs' | 'reconnectInitialDelayMs' | 'reconnectMaxDelayMs' | 'reconnectMaxAttempts';
export type ServerEditorRow = {
    kind: 'field';
    field: ServerTextField;
    editable: boolean;
} | {
    kind: 'transport';
} | {
    kind: 'boolean';
    field: 'failOnStartupError' | 'reconnectEnabled';
} | {
    kind: 'credential';
    ref: string;
} | {
    kind: 'save';
} | {
    kind: 'cancel';
};
export interface ServerEditorState {
    intent: ServerFormIntent;
    originalId?: string;
    draft: ServerFormDraft;
    selected: number;
    editing?: {
        kind: 'field';
        field: ServerTextField;
    } | {
        kind: 'credential';
        ref: string;
    };
    error?: string;
}
export declare const SCENE_POLL_MS = 10000;
export declare const TABS: readonly SceneTab[];
export declare const WORKSPACES: readonly Workspace[];
export declare function clamp(index: number, length: number): number;
export declare function nextSetId(snapshot: McpManagerSnapshot): string;
export declare function removeLastCodePoint(value: string): string;
export declare function navWindow(items: readonly NavItem[], selected: number, limit: number): readonly NavItem[];
//# sourceMappingURL=scene-model.d.ts.map
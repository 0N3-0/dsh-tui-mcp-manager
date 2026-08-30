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
    kind: 'boolean';
    field: 'active';
} | {
    kind: 'search';
} | {
    kind: 'member';
    server: McpServerView;
} | {
    kind: 'save';
} | {
    kind: 'cancel';
};
export interface SetEditorDraft extends ManagedSetRecord {
    active: boolean;
}
export interface SetEditorState {
    mode: 'create' | 'edit';
    draft: SetEditorDraft;
    selected: number;
    memberFilter: string;
    memberSearchCursor?: number;
    editing?: {
        field: 'id' | 'name';
        cursor: number;
    };
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
        cursor: number;
    } | {
        kind: 'credential';
        ref: string;
        cursor: number;
    };
    error?: string;
}
export declare const SCENE_POLL_MS = 10000;
export declare const TABS: readonly SceneTab[];
export declare const WORKSPACES: readonly Workspace[];
export declare function clamp(index: number, length: number): number;
export declare function nextSetId(snapshot: McpManagerSnapshot): string;
export declare function matchesSearch(query: string, ...values: Array<string | undefined>): boolean;
export declare function matchesNavItem(query: string, item: NavItem): boolean;
export interface TextCursorUpdate {
    value: string;
    cursor: number;
}
export declare function textCursorEnd(value: string): number;
export declare function clampTextCursor(value: string, cursor: number): number;
export declare function insertAtTextCursor(value: string, cursor: number, inserted: string, limit: number): TextCursorUpdate;
export declare function removeBeforeTextCursor(value: string, cursor: number): TextCursorUpdate;
export declare function removeAtTextCursor(value: string, cursor: number): TextCursorUpdate;
export declare function terminalTextWidth(value: string): number;
export declare function truncateTerminalText(value: string, maxWidth: number): string;
export interface TextCursorSegments {
    before: string;
    cursor: string;
    after: string;
}
export declare function textCursorSegments(value: string, cursor: number, maxWidth?: number, masked?: boolean): TextCursorSegments;
export declare function navWindow(items: readonly NavItem[], selected: number, limit: number): readonly NavItem[];
export interface IndexedWindow<T> {
    start: number;
    items: readonly T[];
}
export declare function indexedWindow<T>(items: readonly T[], selected: number, limit: number): IndexedWindow<T>;
//# sourceMappingURL=scene-model.d.ts.map
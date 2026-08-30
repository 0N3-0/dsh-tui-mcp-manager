import type { TuiSceneProps } from '@deepseek-harness-tui/dsh-tui/scenes';
import type { McpManagerService } from '../host/manager.js';
import type { CredentialProviderFace } from './credential-provider.js';
import type { McpServerView, McpSetView } from '../host/types.js';
import { type SceneLanguage } from './scene-i18n.js';
import { type NavItem, type SceneTab, type Workspace } from './scene-model.js';
/**
 * Own every mutable Scene concern without rendering any terminal elements.
 * Keeping this hook host-React-only prevents invalid hook calls while making
 * the view layer small enough for server forms to be migrated independently.
 */
export declare function useMcpManagerSceneController(props: TuiSceneProps, manager: McpManagerService, resolveLanguage: () => Promise<SceneLanguage>, credentials?: CredentialProviderFace): {
    lang: any;
    snapshot: any;
    workspace: any;
    focusArea: any;
    selectedIndex: number;
    navItems: NavItem[];
    navTotal: number;
    navFilter: any;
    navSearchCursor: any;
    selected: NavItem;
    selectedServer: McpServerView | undefined;
    selectedSet: McpSetView | undefined;
    tab: any;
    detailActionIndex: any;
    toolIndex: any;
    selectedFilteredToolIndex: any;
    toolDetailOpen: any;
    toolFilter: any;
    toolSearchCursor: any;
    filteredToolIndices: number[];
    doctor: any;
    busy: any;
    notice: any;
    error: any;
    confirm: any;
    setEditor: any;
    setEditorRows: import("./scene-model.js").SetEditorRow[];
    serverEditor: any;
    serverEditorRows: import("./scene-model.js").ServerEditorRow[];
    detailScrollTop: any;
    scrollDetailBy: (delta: number) => void;
    scrollDetailTo: (next: number) => void;
    setFocusArea: any;
    setToolDetailOpen: any;
    beginNavSearch: () => void;
    beginToolSearch: () => void;
    selectNavItem: (item: NavItem) => void;
    selectWorkspace: (next: Workspace) => void;
    selectTab: (next: SceneTab) => void;
    openTool: (index: number) => void;
    activateDetailAction: (index?: any) => void;
    toggleSelected: () => void;
    confirmRemoval: () => void;
    removeConfirmed: () => void;
    cancelRemoval: () => void;
    openCreateSet: () => void;
    openEditSet: () => void;
    activateSetEditorRow: (index: number) => void;
    openServerEditor: (intent: import("./server-form-model.js").ServerFormIntent) => void;
    activateServerEditorRow: (index: number) => void;
};
//# sourceMappingURL=scene-controller.d.ts.map
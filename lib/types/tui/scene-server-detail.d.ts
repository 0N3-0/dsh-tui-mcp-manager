import type { TuiSceneProps } from '@deepseek-harness-tui/dsh-tui/scenes';
import type { McpDoctorReport, McpServerView, McpSetView } from '../host/types.js';
import { type SceneLanguage } from './scene-i18n.js';
import { type FocusArea, type SceneTab } from './scene-model.js';
type ServerStateColor = 'success' | 'warning' | 'error' | 'inactive';
interface ServerDetailViewProps {
    React: TuiSceneProps['React'];
    ui: TuiSceneProps['ui'];
    lang: SceneLanguage;
    server: McpServerView;
    sets: readonly McpSetView[];
    tab: SceneTab;
    focusArea: FocusArea;
    toolIndex: number;
    toolDetailOpen: boolean;
    toolFilter: string;
    toolSearchCursor: number | undefined;
    filteredToolIndices: readonly number[];
    detailScrollHeight: number;
    doctor: McpDoctorReport | undefined;
    busy: string | undefined;
    setToolDetailOpen(open: boolean): void;
    setFocusArea(area: FocusArea): void;
    scrollDetailTo(offset: number): void;
    beginToolSearch(): void;
    openTool(index: number): void;
}
export declare function serverStateGlyph(state: McpServerView['state']): string;
export declare function serverStateColor(state: McpServerView['state']): ServerStateColor;
export declare function renderServerDetailView({ React, ui, lang, server, sets, tab, focusArea, toolIndex, toolDetailOpen, toolFilter, toolSearchCursor, filteredToolIndices, detailScrollHeight, doctor, busy, setToolDetailOpen, setFocusArea, scrollDetailTo, beginToolSearch, openTool, }: ServerDetailViewProps): any;
export {};
//# sourceMappingURL=scene-server-detail.d.ts.map
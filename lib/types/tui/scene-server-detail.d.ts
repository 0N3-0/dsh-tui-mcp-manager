import type { TuiSceneProps } from '@deepseek-harness-tui/dsh-tui/scenes';
import type { McpDoctorReport, McpServerView } from '../host/types.js';
import { type SceneLanguage } from './scene-i18n.js';
import { type FocusArea, type SceneTab } from './scene-model.js';
type ServerStateColor = 'success' | 'warning' | 'error' | 'inactive';
interface ServerDetailViewProps {
    React: TuiSceneProps['React'];
    ui: TuiSceneProps['ui'];
    lang: SceneLanguage;
    server: McpServerView;
    tab: SceneTab;
    focusArea: FocusArea;
    toolIndex: number;
    toolDetailOpen: boolean;
    detailScrollHeight: number;
    doctor: McpDoctorReport | undefined;
    busy: string | undefined;
    setToolDetailOpen(open: boolean): void;
    setFocusArea(area: FocusArea): void;
    scrollDetailTo(offset: number): void;
    openTool(index: number): void;
}
export declare function serverStateGlyph(state: McpServerView['state']): string;
export declare function serverStateColor(state: McpServerView['state']): ServerStateColor;
export declare function renderServerDetailView({ React, ui, lang, server, tab, focusArea, toolIndex, toolDetailOpen, detailScrollHeight, doctor, busy, setToolDetailOpen, setFocusArea, scrollDetailTo, openTool, }: ServerDetailViewProps): any;
export {};
//# sourceMappingURL=scene-server-detail.d.ts.map
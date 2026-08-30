import type { TuiSceneProps } from '@deepseek-harness-tui/dsh-tui/scenes';
export interface SceneSearchInputProps {
    React: TuiSceneProps['React'];
    ui: TuiSceneProps['ui'];
    query: string;
    cursor: number | undefined;
    maxWidth?: number;
    compact?: boolean;
    beginSearch(): void;
}
/** Search field shared by the detail and navigation panes. */
export declare function SceneSearchInput({ React, ui, query, cursor, maxWidth, compact, beginSearch, }: SceneSearchInputProps): any;
//# sourceMappingURL=scene-search-input.d.ts.map
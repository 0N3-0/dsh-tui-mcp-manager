import type { Context } from '@deepseek-ai/cordis';
import type { McpManagerService } from '../host/manager.js';
export declare const name = "dsh-tui-mcp-manager-scene";
type UiLang = 'zh' | 'en';
export declare function resolveTuiLanguage(ctx: any): Promise<UiLang>;
/** Register the full-screen Scene and its command in one Cordis activation. */
export declare function applyTui(ctx: Context, manager: McpManagerService): void;
export type { McpManagerService };
//# sourceMappingURL=index.d.ts.map
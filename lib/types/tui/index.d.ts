import type { Context } from '@deepseek-ai/cordis';
import type { McpManagerService } from '../host/manager.js';
export declare const name = "dsh-tui-mcp-manager-dialog";
type UiLang = 'zh' | 'en';
export declare function resolveTuiLanguage(ctx: any): Promise<UiLang>;
export declare function applyTui(ctx: Context): void;
export type { McpManagerService };
//# sourceMappingURL=index.d.ts.map
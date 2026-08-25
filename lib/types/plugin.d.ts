import type { Context } from '@deepseek-ai/cordis';
import { McpManagerService } from './host/manager.js';
/** Keep required DSH services behind Cordis lifecycle ownership. */
export declare function activate(ctx: Context): void;
declare module '@deepseek-ai/cordis' {
    interface Context {
        mcpManager?: McpManagerService;
    }
}
//# sourceMappingURL=plugin.d.ts.map
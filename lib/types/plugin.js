import { McpManagerService } from './host/manager.js';
import { applyTui } from './tui/index.js';
/** Keep required DSH services behind Cordis lifecycle ownership. */
export function activate(ctx) {
    ctx.inject(['tools', 'loader'], (readyCtx) => {
        const manager = new McpManagerService(readyCtx);
        applyTui(readyCtx, manager);
    });
}
//# sourceMappingURL=plugin.js.map
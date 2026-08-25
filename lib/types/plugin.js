import { McpManagerService } from './host/manager.js';
import { applyTui } from './tui/index.js';
/** Keep required DSH services behind Cordis lifecycle ownership. */
export function activate(ctx) {
    ctx.inject(['tools', 'loader'], (readyCtx) => {
        new McpManagerService(readyCtx);
        applyTui(readyCtx);
    });
}
//# sourceMappingURL=plugin.js.map
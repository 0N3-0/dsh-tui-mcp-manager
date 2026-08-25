import Schema from '@deepseek-ai/schemastery';
import { activate } from './plugin.js';
export const name = 'dsh-tui-mcp-manager';
export const Config = Schema.object({});
export function apply(ctx, _config) {
    activate(ctx);
}
//# sourceMappingURL=index.js.map
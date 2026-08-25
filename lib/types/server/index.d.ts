import type { Context } from '@deepseek-ai/cordis';
import type Schema from '@deepseek-ai/schemastery';
export declare const name = "dsh-tui-mcp-manager-server";
export declare const inject: string[];
export declare const Config: Schema;
/**
 * Credential-aware Loader row. The Loader owns this plugin's lifecycle; this
 * adapter owns exactly one upstream mcp-client child only because upstream's
 * Config accepts resolved strings rather than credential references.
 */
export declare function apply(ctx: Context, input: unknown): Promise<void>;
//# sourceMappingURL=index.d.ts.map
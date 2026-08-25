import type { Context } from '@deepseek-ai/cordis';
export interface ProfileIdentity {
    key: string;
    source: 'ctx.baseUrl' | 'fallback';
    dir?: string;
    patchPath?: string;
}
/**
 * Resolve the DSH profile this process booted.
 *
 * `dsh --profile <name>` anchors the Loader's `ctx.baseUrl` at
 * `$DSH_HOME/profiles/<name>/`; that anchor is the only public context fact
 * naming the active profile today. There is no dedicated `ctx.profile`
 * service yet (see README: upstream extension candidates), so this helper
 * validates that the anchor really sits under `$DSH_HOME/profiles` before
 * trusting it and otherwise falls back to a shared `default` section.
 */
export declare function detectProfile(ctx: Context): ProfileIdentity;
//# sourceMappingURL=profile.d.ts.map
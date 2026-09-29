import type { Context } from '@deepseek-ai/cordis';
export interface ProfileIdentity {
    key: string;
    source: 'profileContext' | 'ctx.baseUrl' | 'fallback';
    dir?: string;
    patchPath?: string;
}
/**
 * Resolve the DSH profile this process booted.
 *
 * Current DSH profiles expose their identity through `ctx.profileContext`.
 * Keep the validated Loader baseUrl path for standalone compositions that
 * mount this plugin without the profile service.
 */
export declare function detectProfile(ctx: Context): ProfileIdentity;
//# sourceMappingURL=profile.d.ts.map
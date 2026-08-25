import * as mcpClientModule from '@deepseek-ai/dsh-mcp-client';
import { credentialRef } from '@deepseek-ai/dsh-credentials';
import { ManagedMcpServerConfigSchema, normalizeSecretHeaderEntries, normalizeServerRecord, toMcpClientSkeleton, } from '../host/schema.js';
export const name = 'dsh-tui-mcp-manager-server';
export const inject = ['tools', 'credentials'];
export const Config = ManagedMcpServerConfigSchema;
function errorText(error) {
    return error instanceof Error ? error.message : String(error);
}
function normalizeConfig(input) {
    const value = ManagedMcpServerConfigSchema(input);
    return normalizeServerRecord({ ...value, id: 'runtime', name: '', enabled: true });
}
function usesCredential(config, ref) {
    if (Object.values(config.secretEnv ?? {}).includes(ref))
        return true;
    return Object.values(config.secretHeaders ?? {}).some((entry) => entry.ref === ref);
}
async function resolveCredential(ctx, ref, where) {
    const hit = await ctx.credentials.resolve(credentialRef(ref));
    if (hit === undefined) {
        throw new Error(`${where}: credential ${ref} is not configured`);
    }
    return hit.value;
}
async function buildRuntimeConfig(ctx, config) {
    const skeleton = toMcpClientSkeleton(config);
    if (config.transport === 'stdio') {
        const env = { ...(config.env ?? {}) };
        for (const [key, ref] of Object.entries(config.secretEnv ?? {})) {
            env[key] = await resolveCredential(ctx, ref, `secretEnv[${JSON.stringify(key)}]`);
        }
        return { ...skeleton, env };
    }
    const headers = { ...(config.headers ?? {}) };
    for (const [key, entry] of Object.entries(normalizeSecretHeaderEntries(config.secretHeaders))) {
        const value = await resolveCredential(ctx, entry.ref, `secretHeaders[${JSON.stringify(key)}]`);
        headers[key] = `${entry.prefix ?? ''}${value}`;
    }
    return { ...skeleton, headers };
}
/**
 * Credential-aware Loader row. The Loader owns this plugin's lifecycle; this
 * adapter owns exactly one upstream mcp-client child only because upstream's
 * Config accepts resolved strings rather than credential references.
 */
export async function apply(ctx, input) {
    const config = normalizeConfig(input);
    const label = `dsh-tui-mcp-manager-server(${config.serverName})`;
    const plugin = {
        name: mcpClientModule.name,
        inject: mcpClientModule.inject,
        Config: mcpClientModule.Config,
        apply: mcpClientModule.apply,
    };
    let child;
    let disposed = false;
    let chain = Promise.resolve();
    const stop = async () => {
        const current = child;
        child = undefined;
        if (current !== undefined)
            await current.dispose();
    };
    const restart = async () => {
        if (disposed)
            return;
        let runtime;
        try {
            runtime = await buildRuntimeConfig(ctx, config);
        }
        catch (error) {
            await stop();
            ctx.logger.error(`${label}: ${errorText(error)}`);
            return;
        }
        try {
            if (child !== undefined) {
                await child.update(runtime, true);
            }
            else {
                const next = ctx.plugin(plugin, runtime);
                child = next;
                await next;
            }
        }
        catch (error) {
            child = undefined;
            ctx.logger.error(`${label}: failed to activate mcp-client: ${errorText(error)}`);
        }
    };
    const enqueueRestart = () => {
        const run = chain.then(restart, restart);
        chain = run.then(() => undefined, () => undefined);
        return run;
    };
    ctx.on('credentials/updated', (ref) => {
        if (usesCredential(config, ref))
            void enqueueRestart();
    });
    ctx.effect(() => async () => {
        disposed = true;
        await chain;
        await stop();
    }, `dsh-tui-mcp-manager-server(${config.serverName})`);
    await enqueueRestart();
}
//# sourceMappingURL=index.js.map
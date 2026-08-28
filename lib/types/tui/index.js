import { readFile, stat } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { createMcpManagerScene } from './scene.js';
export const name = 'dsh-tui-mcp-manager-scene';
const PLUGIN_LOADED_AT = Date.now();
const SCENE_ID = 'dsh-tui-mcp-manager';
function debug(message) {
    if (process.env.DSH_TUI_DEBUG === '1') {
        process.stderr.write(`[dsh-tui-mcp-manager] ${message}\n`);
    }
}
function asLang(value) {
    return value === 'zh' || value === 'en' ? value : undefined;
}
export async function resolveTuiLanguage(ctx) {
    let persisted;
    let preferenceUpdatedAt = 0;
    const preferencePath = join(homedir(), '.dsh-tui', 'lang.json');
    try {
        const [raw, metadata] = await Promise.all([
            readFile(preferencePath, 'utf8'),
            stat(preferencePath),
        ]);
        persisted = asLang(JSON.parse(raw)?.lang);
        preferenceUpdatedAt = metadata.mtimeMs;
    }
    catch {
        // Continue through dsh-TUI's normal startup precedence.
    }
    // /lang writes this file synchronously before repainting the host. A file
    // changed after this plugin loaded therefore represents the live language,
    // even while the best-effort settings mirror is still catching up.
    if (persisted && preferenceUpdatedAt >= PLUGIN_LOADED_AT)
        return persisted;
    const fromEnvironment = asLang(process.env.DSH_TUI_LANG);
    if (fromEnvironment)
        return fromEnvironment;
    try {
        const settings = ctx.get?.('settings');
        const namespace = settings
            ?.describe?.({ redactSecrets: true })
            ?.find?.((entry) => entry.ns === 'dsh-tui');
        const configured = asLang(namespace?.value?.lang);
        if (configured)
            return configured;
    }
    catch {
        // Fall through to the same preference file used by dsh-TUI's /lang command.
    }
    if (persisted)
        return persisted;
    const locale = process.env.LC_ALL || process.env.LC_MESSAGES || process.env.LANG || '';
    if (!locale)
        return 'zh';
    return locale.split('.')[0]?.toLowerCase().startsWith('zh') ? 'zh' : 'en';
}
/** Register the full-screen Scene and its command in one Cordis activation. */
export function applyTui(ctx, manager) {
    // dsh-TUI scopes Scene descriptors to the activation that registered them.
    // The command must therefore be registered inside this same injection.
    ctx.inject(['tuiScenes'], (tuiCtx) => {
        const scenes = tuiCtx.get?.('tuiScenes', false);
        if (!scenes) {
            debug('command inactive: tuiScenes is unavailable');
            return;
        }
        const credentials = tuiCtx.get?.('credentials', false);
        tuiCtx.effect(() => scenes.register({
            id: SCENE_ID,
            title: 'MCP Manager',
            component: createMcpManagerScene(manager, () => resolveTuiLanguage(tuiCtx), credentials),
        }, tuiCtx));
        tuiCtx.effect(() => {
            const disposeTree = tuiCtx.get?.('tuiCommandTrees', false)?.register?.({
                root: 'mcp-manager',
                descriptions: {
                    zh: '打开 MCP 服务器管理器',
                    en: 'Open the MCP server manager',
                },
                children: () => [],
            });
            const definition = {
                name: 'mcp-manager',
                description: 'Open the MCP server manager',
                handler: async () => {
                    if (!scenes.open(SCENE_ID)) {
                        throw new Error('dsh-tui-mcp-manager: the full-screen Scene could not be opened');
                    }
                    return { kind: 'success' };
                },
            };
            const pluginHost = tuiCtx.get?.('tuiPluginHost', false);
            const commands = tuiCtx.get?.('commands', false);
            let disposeCommand;
            try {
                disposeCommand = pluginHost
                    ? pluginHost.registerCommand(tuiCtx, 'dsh-tui.mcp-manager', definition)
                    : commands?.register?.(definition);
                debug(`command registered through ${pluginHost ? 'tuiPluginHost' : 'commands service'}`);
            }
            catch (error) {
                const message = error instanceof Error ? error.message : String(error);
                const code = error?.code;
                if (code === 'COMPONENT_NOT_ADMITTED' && commands?.register) {
                    disposeCommand = commands.register(definition);
                    debug('command registered through commands service: host did not admit this Loader activation');
                }
                else {
                    disposeTree?.();
                    debug(`command registration skipped: ${message}`);
                    tuiCtx.logger?.warn?.(`dsh-tui-mcp-manager: command registration skipped: ${message}`);
                    return;
                }
            }
            if (!disposeCommand) {
                disposeTree?.();
                return;
            }
            return () => {
                disposeCommand();
                disposeTree?.();
            };
        });
    });
}
//# sourceMappingURL=index.js.map
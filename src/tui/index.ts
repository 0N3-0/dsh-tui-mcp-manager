import { readFile, stat } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import type { CommandDefinition } from '@deepseek-ai/dsh-commands'
import type { TuiPluginHost } from '@deepseek-harness-tui/dsh-tui/plugin-host'
import type { TuiSceneRuntime } from '@deepseek-harness-tui/dsh-tui/scenes'
import type { McpManagerService } from '../host/manager.js'
import type { CredentialProviderFace } from './credential-provider.js'
import { createMcpManagerScene } from './scene.js'

export const name = 'dsh-tui-mcp-manager-scene'

type UiLang = 'zh' | 'en'

const PLUGIN_LOADED_AT = Date.now()
const SCENE_ID = 'dsh-tui-mcp-manager'

function debug(message: string): void {
  if (process.env.DSH_TUI_DEBUG === '1') {
    process.stderr.write(`[dsh-tui-mcp-manager] ${message}\n`)
  }
}

function asLang(value: unknown): UiLang | undefined {
  return value === 'zh' || value === 'en' ? value : undefined
}

export async function resolveTuiLanguage(ctx: any): Promise<UiLang> {
  let persisted: UiLang | undefined
  let preferenceUpdatedAt = 0
  const preferencePath = join(homedir(), '.dsh-tui', 'lang.json')
  try {
    const [raw, metadata] = await Promise.all([
      readFile(preferencePath, 'utf8'),
      stat(preferencePath),
    ])
    persisted = asLang(JSON.parse(raw)?.lang)
    preferenceUpdatedAt = metadata.mtimeMs
  } catch {
    // Continue through dsh-TUI's normal startup precedence.
  }

  // /lang writes this file synchronously before repainting the host. A file
  // changed after this plugin loaded therefore represents the live language,
  // even while the best-effort settings mirror is still catching up.
  if (persisted && preferenceUpdatedAt >= PLUGIN_LOADED_AT) return persisted

  const fromEnvironment = asLang(process.env.DSH_TUI_LANG)
  if (fromEnvironment) return fromEnvironment

  try {
    const settings = ctx.get?.('settings')
    const namespace = settings
      ?.describe?.({ redactSecrets: true })
      ?.find?.((entry: { ns?: string }) => entry.ns === 'dsh-tui')
    const configured = asLang(namespace?.value?.lang)
    if (configured) return configured
  } catch {
    // Fall through to the same preference file used by dsh-TUI's /lang command.
  }

  if (persisted) return persisted

  const locale = process.env.LC_ALL || process.env.LC_MESSAGES || process.env.LANG || ''
  if (!locale) return 'zh'
  return locale.split('.')[0]?.toLowerCase().startsWith('zh') ? 'zh' : 'en'
}

/** Register the full-screen Scene and its command in one Cordis activation. */
export function applyTui(ctx: Context, manager: McpManagerService): void {
  // dsh-TUI scopes Scene descriptors to the activation that registered them.
  // The command must therefore be registered inside this same injection.
  ctx.inject(['tuiScenes'], (tuiCtx: any) => {
    const scenes = tuiCtx.get?.('tuiScenes', false) as TuiSceneRuntime | undefined
    if (!scenes) {
      debug('command inactive: tuiScenes is unavailable')
      return
    }

    const credentials = tuiCtx.get?.('credentials', false) as CredentialProviderFace | undefined
    tuiCtx.effect(() => scenes.register({
      id: SCENE_ID,
      title: 'MCP Manager',
      component: createMcpManagerScene(manager, () => resolveTuiLanguage(tuiCtx), credentials),
    }, tuiCtx))

    tuiCtx.effect(() => {
      const disposeTree = tuiCtx.get?.('tuiCommandTrees', false)?.register?.({
        root: 'mcp-manager',
        descriptions: {
          zh: '打开 MCP 服务器管理器',
          en: 'Open the MCP server manager',
        },
        children: () => [],
      })
      const definition: CommandDefinition = {
        name: 'mcp-manager',
        description: 'Open the MCP server manager',
        handler: async () => {
          if (!scenes.open(SCENE_ID)) {
            throw new Error('dsh-tui-mcp-manager: the full-screen Scene could not be opened')
          }
          return { kind: 'success' as const }
        },
      }
      const pluginHost = tuiCtx.get?.('tuiPluginHost', false) as TuiPluginHost | undefined
      const commands = tuiCtx.get?.('commands', false)
      let disposeCommand: (() => void) | undefined
      try {
        disposeCommand = pluginHost
          ? pluginHost.registerCommand(tuiCtx, 'dsh-tui.mcp-manager', definition)
          : commands?.register?.(definition)
        debug(`command registered through ${pluginHost ? 'tuiPluginHost' : 'commands service'}`)
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        const code = (error as { code?: unknown })?.code
        if (code === 'COMPONENT_NOT_ADMITTED' && commands?.register) {
          disposeCommand = commands.register(definition)
          debug('command registered through commands service: host did not admit this Loader activation')
        } else {
          disposeTree?.()
          debug(`command registration skipped: ${message}`)
          tuiCtx.logger?.warn?.(`dsh-tui-mcp-manager: command registration skipped: ${message}`)
          return
        }
      }
      if (!disposeCommand) {
        disposeTree?.()
        return
      }
      return () => {
        disposeCommand()
        disposeTree?.()
      }
    })
  })
}

export type { McpManagerService }

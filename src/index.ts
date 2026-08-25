import type { Context } from '@deepseek-ai/cordis'
import Schema from '@deepseek-ai/schemastery'
import { activate } from './plugin.js'

export const name = 'dsh-tui-mcp-manager'

export interface Config {}
export const Config: Schema<Config> = Schema.object({})

export function apply(ctx: Context, _config: Config): void {
  activate(ctx)
}

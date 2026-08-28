import type { Context } from '@deepseek-ai/cordis'
import { McpManagerService } from './host/manager.js'
import { applyTui } from './tui/index.js'

/** Keep required DSH services behind Cordis lifecycle ownership. */
export function activate(ctx: Context): void {
  ctx.inject(['tools', 'loader'], (readyCtx) => {
    const manager = new McpManagerService(readyCtx)
    applyTui(readyCtx, manager)
  })
}

declare module '@deepseek-ai/cordis' {
  interface Context {
    mcpManager?: McpManagerService
  }
}

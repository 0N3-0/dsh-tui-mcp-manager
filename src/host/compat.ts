import type { Context } from '@deepseek-ai/cordis'

/**
 * Compatibility adapters for DSH host APIs that moved between the rc line and
 * the 0.1.5 line. Keeping every shim here means the next upstream rename is a
 * one-file audit, and each adapter stays inert on the line it does not target.
 */

/** Structural view of `ctx.connection` (web profile only). */
export interface ConnectionRpcFace {
  rpc: {
    /**
     * dsh-client-connection >= 0.1.5 declares `(channel, handler)`; the rc line
     * required a `{ authority }` registration policy as a third argument. The
     * new carrier ignores extra arguments, so passing it serves both lines.
     */
    handle(
      channel: string,
      handler: (endpoint: string, payload: unknown) => Promise<unknown>,
      options?: { authority: string },
    ): unknown
  }
}

/**
 * Observe credential-reference changes across both event generations.
 *
 * dsh-credentials >= 0.1.5 split `credentials/updated` into
 * `credentials/reference-updated` (references, what managed MCP rows use) and
 * `credentials/record-updated`. The legacy name still fires on the rc line and
 * is inert on the new line, so one listener is enough.
 */
export function onCredentialReferenceUpdated(ctx: Context, listener: (ref: string) => void): void {
  const legacy = ctx as unknown as { on(name: string, listener: (ref: string) => void): void }
  ctx.on('credentials/reference-updated', listener)
  legacy.on('credentials/updated', listener)
}

/** Register one loopback-only RPC channel on both connection generations. */
export function registerLoopbackRpcChannel(
  connection: ConnectionRpcFace,
  channel: string,
  handler: (endpoint: string, payload: unknown) => Promise<unknown>,
): void {
  connection.rpc.handle(channel, handler, { authority: 'loopback' })
}

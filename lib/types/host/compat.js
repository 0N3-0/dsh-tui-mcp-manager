/**
 * Observe credential-reference changes across both event generations.
 *
 * dsh-credentials >= 0.1.5 split `credentials/updated` into
 * `credentials/reference-updated` (references, what managed MCP rows use) and
 * `credentials/record-updated`. The legacy name still fires on the rc line and
 * is inert on the new line, so one listener is enough.
 */
export function onCredentialReferenceUpdated(ctx, listener) {
    const legacy = ctx;
    ctx.on('credentials/reference-updated', listener);
    legacy.on('credentials/updated', listener);
}
/** Register one loopback-only RPC channel on both connection generations. */
export function registerLoopbackRpcChannel(connection, channel, handler) {
    connection.rpc.handle(channel, handler, { authority: 'loopback' });
}
//# sourceMappingURL=compat.js.map
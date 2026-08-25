/** Business error with a machine-readable code, surfaced inside RPC error messages. */
export class ManagerError extends Error {
    code;
    constructor(message, options = {}) {
        super(message, options.cause === undefined ? undefined : { cause: options.cause });
        this.name = 'ManagerError';
        this.code = options.code ?? 'internal';
    }
}
//# sourceMappingURL=types.js.map
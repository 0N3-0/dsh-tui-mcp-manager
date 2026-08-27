const CREDENTIAL_REF = /^[A-Za-z_][A-Za-z0-9_]*$/;
const PLAIN_SECRET_HEADER = /^(authorization|proxy-authorization|cookie|api-key|x-api-key|x-auth-token)$/i;
const PLAIN_SECRET_ENV = /(?:^|_)(TOKEN|SECRET|PASSWORD|PASSWD|API_?KEY|AUTH)(?:$|_)|^AUTH/i;
export function nextServerId(snapshot) {
    const existing = new Set(snapshot.servers.map((server) => server.id));
    let index = 1;
    while (existing.has(`mcp-${index}`))
        index += 1;
    return `mcp-${index}`;
}
export function nextDuplicateId(snapshot, source) {
    const existing = new Set(snapshot.servers.map((server) => server.id));
    for (let index = 1;; index += 1) {
        const suffix = index === 1 ? '-copy' : `-copy-${index}`;
        const candidate = `${source.slice(0, 64 - suffix.length)}${suffix}`;
        if (!existing.has(candidate))
            return candidate;
    }
}
export function nextDuplicateServerName(snapshot, source) {
    const existing = new Set(snapshot.servers.map((server) => server.serverName));
    for (let index = 1;; index += 1) {
        const suffix = index === 1 ? '_copy' : `_copy${index}`;
        const candidate = `${source.slice(0, 32 - suffix.length)}${suffix}`;
        if (!existing.has(candidate))
            return candidate;
    }
}
export function createServerDraft(snapshot, intent, existing, language = 'en') {
    const duplicate = intent === 'duplicate' && existing !== undefined;
    return {
        id: duplicate ? nextDuplicateId(snapshot, existing.id) : existing?.id ?? nextServerId(snapshot),
        displayName: duplicate
            ? `${existing.name}${language === 'zh' ? ' 副本' : ' copy'}`
            : existing?.name ?? '',
        serverName: duplicate
            ? nextDuplicateServerName(snapshot, existing.serverName)
            : existing?.serverName ?? '',
        transport: existing?.transport ?? 'stdio',
        command: existing?.command ?? '',
        args: formatArgs(existing?.args),
        cwd: existing?.cwd ?? '',
        env: formatEquals(existing?.env),
        secretEnv: formatEquals(Object.fromEntries(Object.entries(existing?.secretEnv ?? {}).map(([key, entry]) => [key, entry.ref]))),
        url: existing?.url ?? '',
        headers: formatEquals(existing?.headers),
        secretHeaders: formatSecretHeaders(existing?.secretHeaders),
        enabled: duplicate ? false : existing?.enabled ?? false,
        toolCallTimeoutMs: String(existing?.toolCallTimeoutMs ?? 60_000),
        failOnStartupError: existing?.failOnStartupError ?? false,
        reconnectEnabled: existing?.reconnect?.enabled ?? true,
        reconnectInitialDelayMs: String(existing?.reconnect?.initialDelayMs ?? 500),
        reconnectMaxDelayMs: String(existing?.reconnect?.maxDelayMs ?? 30_000),
        reconnectMaxAttempts: String(existing?.reconnect?.maxAttempts ?? 10),
        credentialValues: {},
    };
}
export function credentialReferences(draft) {
    const refs = draft.transport === 'stdio'
        ? Object.values(parseCredentialRefs(draft.secretEnv))
        : Object.values(parseSecretHeaders(draft.secretHeaders)).map((entry) => entry.ref);
    return [...new Set(refs)];
}
export function positiveNumber(value) {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed >= 1 && parsed <= 2_147_483_647 ? parsed : undefined;
}
export function positiveInteger(value) {
    const parsed = positiveNumber(value);
    return parsed !== undefined && Number.isInteger(parsed) ? parsed : undefined;
}
export function validateServerDraft(draft, snapshot, intent, originalId) {
    const id = draft.id.trim();
    const serverName = draft.serverName.trim();
    if (!/^[a-z0-9][a-z0-9._-]{0,63}$/.test(id))
        return 'invalid-id';
    if (intent !== 'edit' && snapshot.servers.some((server) => server.id === id))
        return 'duplicate-id';
    if (intent === 'edit' && originalId !== undefined && id !== originalId)
        return 'invalid-id';
    if (!/^[A-Za-z0-9_-]{1,32}$/.test(serverName))
        return 'invalid-server-name';
    if (snapshot.servers.some((server) => server.id !== originalId && server.serverName === serverName)) {
        return 'duplicate-server-name';
    }
    if (draft.transport === 'stdio') {
        if (draft.command.trim() === '')
            return 'invalid-command';
        if (!isPairMap(draft.env))
            return 'invalid-pairs';
        if (hasPlainSecretEnv(draft.env))
            return 'plain-secret-env';
        if (!isCredentialRefMap(draft.secretEnv))
            return 'invalid-credential-refs';
    }
    else {
        if (draft.url.trim() === '')
            return 'invalid-url';
        if (!isPairMap(draft.headers))
            return 'invalid-pairs';
        if (hasPlainSecretHeader(draft.headers))
            return 'plain-secret-headers';
        if (!isSecretHeaderMap(draft.secretHeaders))
            return 'invalid-secret-headers';
    }
    if (positiveNumber(draft.toolCallTimeoutMs) === undefined)
        return 'invalid-positive-number';
    if (positiveNumber(draft.reconnectInitialDelayMs) === undefined)
        return 'invalid-positive-number';
    if (positiveNumber(draft.reconnectMaxDelayMs) === undefined)
        return 'invalid-positive-number';
    if (positiveInteger(draft.reconnectMaxAttempts) === undefined)
        return 'invalid-positive-integer';
    if (Number(draft.reconnectInitialDelayMs) > Number(draft.reconnectMaxDelayMs))
        return 'invalid-reconnect-delays';
    return undefined;
}
export function buildServerSubmission(draft) {
    const common = {
        id: draft.id.trim(),
        name: draft.displayName.trim() || draft.serverName.trim(),
        serverName: draft.serverName.trim(),
        enabled: draft.enabled,
        toolCallTimeoutMs: Number(draft.toolCallTimeoutMs),
        failOnStartupError: draft.failOnStartupError,
        reconnect: {
            enabled: draft.reconnectEnabled,
            initialDelayMs: Number(draft.reconnectInitialDelayMs),
            maxDelayMs: Number(draft.reconnectMaxDelayMs),
            maxAttempts: Number(draft.reconnectMaxAttempts),
        },
    };
    const record = draft.transport === 'stdio'
        ? {
            ...common,
            transport: 'stdio',
            command: draft.command.trim(),
            args: parseArgs(draft.args),
            cwd: draft.cwd.trim(),
            env: parsePairs(draft.env),
            secretEnv: parseCredentialRefs(draft.secretEnv),
        }
        : {
            ...common,
            transport: 'streamable-http',
            url: draft.url.trim(),
            headers: parsePairs(draft.headers),
            secretHeaders: parseSecretHeaders(draft.secretHeaders),
        };
    const activeRefs = new Set(credentialReferences(draft));
    return {
        record,
        credentialValues: Object.fromEntries(Object.entries(draft.credentialValues).filter(([ref]) => activeRefs.has(ref))),
    };
}
export function parseAssignments(value) {
    const result = [];
    for (const raw of value.split(/[\n,;]+/)) {
        const part = raw.trim();
        if (part === '')
            continue;
        const index = part.indexOf('=');
        if (index <= 0)
            return undefined;
        const name = part.slice(0, index).trim();
        const item = part.slice(index + 1).trim();
        if (name === '' || item === '')
            return undefined;
        result.push([name, item]);
    }
    return result;
}
export function isPairMap(value) {
    return value.trim() === '' || parseAssignments(value) !== undefined;
}
export function parsePairs(value) {
    return Object.fromEntries(parseAssignments(value) ?? []);
}
export function hasPlainSecretHeader(value) {
    return (parseAssignments(value) ?? []).some(([name]) => PLAIN_SECRET_HEADER.test(name));
}
export function hasPlainSecretEnv(value) {
    return (parseAssignments(value) ?? []).some(([name]) => PLAIN_SECRET_ENV.test(name));
}
export function isCredentialRefMap(value) {
    const entries = parseAssignments(value);
    return entries !== undefined && entries.every(([, ref]) => CREDENTIAL_REF.test(ref));
}
export function parseCredentialRefs(value) {
    return Object.fromEntries(parseAssignments(value) ?? []);
}
export function formatEquals(value) {
    return Object.entries(value ?? {})
        .map(([key, item]) => `${key}=${item}`)
        .join(', ');
}
/**
 * Parse one compact secret-header entry. The final token is a credential
 * reference; text before it (including whitespace) is the literal prefix.
 */
export function parseSecretHeaderSpec(spec) {
    if (CREDENTIAL_REF.test(spec))
        return { ref: spec };
    const prefixed = spec.match(/^(.+\s)([A-Za-z_][A-Za-z0-9_]*)$/s);
    return prefixed ? { ref: prefixed[2], prefix: prefixed[1] } : undefined;
}
export function isSecretHeaderMap(value) {
    const entries = parseAssignments(value);
    return entries !== undefined && entries.every(([, spec]) => parseSecretHeaderSpec(spec) !== undefined);
}
export function parseSecretHeaders(value) {
    return Object.fromEntries((parseAssignments(value) ?? []).map(([name, spec]) => [name, parseSecretHeaderSpec(spec)]));
}
export function formatSecretHeaders(value) {
    return Object.entries(value ?? {})
        .map(([key, entry]) => `${key}=${entry.prefix ?? ''}${entry.ref}`)
        .join(', ');
}
export function parseArgs(value) {
    const result = [];
    let current = '';
    let quote;
    let escaped = false;
    let started = false;
    for (const character of value) {
        if (escaped) {
            current += character;
            escaped = false;
            started = true;
        }
        else if (character === '\\' && quote !== "'") {
            escaped = true;
            started = true;
        }
        else if (quote) {
            if (character === quote)
                quote = undefined;
            else
                current += character;
        }
        else if (character === '"' || character === "'") {
            quote = character;
            started = true;
        }
        else if (/\s/.test(character)) {
            if (started)
                result.push(current);
            current = '';
            started = false;
        }
        else {
            current += character;
            started = true;
        }
    }
    if (escaped)
        current += '\\';
    if (started)
        result.push(current);
    return result;
}
export function formatArgs(value) {
    return (value ?? [])
        .map((item) => (item === '' || /[\s"'\\]/.test(item) ? JSON.stringify(item) : item))
        .join(' ');
}
//# sourceMappingURL=server-form-model.js.map
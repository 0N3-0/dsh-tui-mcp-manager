import * as yaml from 'js-yaml';
import { access, constants, mkdir, open, readFile, rename, stat, unlink } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import { dirname } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
const LOCK_TIMEOUT_MS = 5_000;
const SET_ID = /^[a-z0-9][a-z0-9._-]{0,63}$/;
function errorText(error) {
    return error instanceof Error ? error.message : String(error);
}
function asObject(value, where) {
    if (typeof value !== 'object' || value === null || Array.isArray(value))
        throw new Error(`${where} must be an object`);
    return value;
}
export function normalizeSetRecord(input) {
    const value = asObject(input, 'set');
    if (typeof value.id !== 'string' || !SET_ID.test(value.id)) {
        throw new Error('set id must match [a-z0-9][a-z0-9._-]{0,63}');
    }
    if (typeof value.name !== 'string' || value.name.trim() === '' || value.name.length > 80) {
        throw new Error('set name must contain 1 to 80 characters');
    }
    // `mode` existed in the first Set format. Accept it while reading old files,
    // but multi-active Sets use union semantics and no longer persist the field.
    if (value.mode !== undefined && value.mode !== 'exclusive' && value.mode !== 'additive') {
        throw new Error('legacy set mode must be exclusive or additive');
    }
    if (!Array.isArray(value.serverIds) || value.serverIds.some((id) => typeof id !== 'string')) {
        throw new Error('set serverIds must be an array of strings');
    }
    return {
        id: value.id,
        name: value.name.trim(),
        serverIds: [...new Set(value.serverIds)],
    };
}
/** Apply the union of all active Sets in one complete patch update. */
export function applyActiveSetsToServers(servers, sets, activeSetIds) {
    const known = new Set(servers.map((server) => server.id));
    const unknown = sets.flatMap((set) => set.serverIds).filter((id) => !known.has(id));
    if (unknown.length > 0)
        throw new Error(`set references unknown server(s): ${unknown.join(', ')}`);
    const setIds = new Set(sets.map((set) => set.id));
    const unknownActive = activeSetIds.filter((id) => !setIds.has(id));
    if (unknownActive.length > 0)
        throw new Error(`active set does not exist: ${unknownActive.join(', ')}`);
    const active = new Set(activeSetIds);
    const activeMembers = new Set(sets.filter((set) => active.has(set.id)).flatMap((set) => set.serverIds));
    return servers.map((server) => ({
        ...server,
        enabled: activeMembers.has(server.id),
    }));
}
function parseDocument(content, filename) {
    let parsed;
    try {
        parsed = yaml.load(content, { schema: yaml.JSON_SCHEMA, filename });
    }
    catch (error) {
        throw new Error(`failed to parse ${filename}: ${errorText(error)}`, { cause: error });
    }
    if (parsed === undefined || parsed === null)
        return { version: 1, sets: [] };
    const value = asObject(parsed, filename);
    if (value.version !== 1)
        throw new Error(`${filename} version must be 1`);
    if (!Array.isArray(value.sets))
        throw new Error(`${filename} sets must be an array`);
    const sets = value.sets.map(normalizeSetRecord);
    const ids = new Set();
    for (const set of sets) {
        if (ids.has(set.id))
            throw new Error(`${filename} contains duplicate set id ${JSON.stringify(set.id)}`);
        ids.add(set.id);
    }
    if (value.activeSets !== undefined && (!Array.isArray(value.activeSets) || value.activeSets.some((id) => typeof id !== 'string' || !ids.has(id)))) {
        throw new Error(`${filename} activeSets must reference existing sets`);
    }
    if (value.initialized !== undefined && typeof value.initialized !== 'boolean') {
        throw new Error(`${filename} initialized must be a boolean`);
    }
    return {
        version: 1,
        sets,
        ...(value.initialized === undefined ? {} : { initialized: value.initialized }),
        ...(value.activeSets === undefined ? {} : { activeSets: [...new Set(value.activeSets)] }),
    };
}
async function writable(filename) {
    try {
        await access(filename, constants.W_OK);
        return true;
    }
    catch (error) {
        if (error.code !== 'ENOENT')
            return false;
        try {
            await access(dirname(filename), constants.W_OK);
            return true;
        }
        catch {
            return false;
        }
    }
}
async function withFileLock(filename, operation) {
    await mkdir(dirname(filename), { recursive: true });
    const lockPath = `${filename}.lock`;
    const deadline = Date.now() + LOCK_TIMEOUT_MS;
    let handle;
    while (true) {
        try {
            handle = await open(lockPath, 'wx', 0o600);
            break;
        }
        catch (error) {
            if (error.code !== 'EEXIST' || Date.now() >= deadline) {
                throw new Error(`failed to acquire set writer lock ${lockPath}: ${errorText(error)}`, { cause: error });
            }
            await delay(25);
        }
    }
    try {
        return await operation();
    }
    finally {
        await handle.close();
        await unlink(lockPath).catch(() => { });
    }
}
async function writeAtomic(filename, content) {
    await mkdir(dirname(filename), { recursive: true });
    let mode = 0o600;
    try {
        mode = (await stat(filename)).mode & 0o777;
    }
    catch (error) {
        if (error.code !== 'ENOENT')
            throw error;
    }
    const temp = `${filename}.${process.pid}-${randomBytes(8).toString('hex')}.tmp`;
    const handle = await open(temp, 'wx', mode);
    try {
        await handle.writeFile(content, 'utf8');
        await handle.sync();
        await handle.close();
        await rename(temp, filename);
    }
    catch (error) {
        await handle.close().catch(() => { });
        await unlink(temp).catch(() => { });
        throw error;
    }
}
export class ProfileSetStore {
    path;
    constructor(path) {
        this.path = path;
    }
    async readText() {
        try {
            return await readFile(this.path, 'utf8');
        }
        catch (error) {
            if (error.code === 'ENOENT')
                return 'version: 1\nsets: []\n';
            throw error;
        }
    }
    async read() {
        const document = parseDocument(await this.readText(), this.path);
        return {
            sets: document.sets.map((set) => ({ ...set, serverIds: [...set.serverIds] })),
            initialized: document.initialized ?? false,
            activeSetIds: [...(document.activeSets ?? [])],
            writable: await writable(this.path),
            path: this.path,
        };
    }
    async write(sets, activeSetIds = []) {
        const normalized = sets.map(normalizeSetRecord);
        const known = new Set(normalized.map((set) => set.id));
        if (activeSetIds.some((id) => !known.has(id)))
            throw new Error('active sets must reference existing sets');
        const activeSets = [...new Set(activeSetIds)];
        return withFileLock(this.path, async () => {
            parseDocument(await this.readText(), this.path);
            const document = {
                version: 1,
                initialized: true,
                ...(activeSets.length === 0 ? {} : { activeSets }),
                sets: normalized,
            };
            const content = yaml.dump(document, { schema: yaml.JSON_SCHEMA, noRefs: true, lineWidth: 120, noCompatMode: true });
            parseDocument(content, this.path);
            await writeAtomic(this.path, content);
            return {
                sets: normalized.map((set) => ({ ...set, serverIds: [...set.serverIds] })),
                initialized: true,
                activeSetIds: [...activeSets],
                writable: true,
                path: this.path,
            };
        });
    }
}
//# sourceMappingURL=set-store.js.map
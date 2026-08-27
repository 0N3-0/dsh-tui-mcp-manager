import type { ManagedServerRecord, ManagedSetRecord } from './types.js';
export interface SetStoreSnapshot {
    sets: ManagedSetRecord[];
    initialized: boolean;
    activeSetIds: string[];
    writable: boolean;
    path: string;
}
export declare function normalizeSetRecord(input: unknown): ManagedSetRecord;
/** Apply the union of all active Sets in one complete patch update. */
export declare function applyActiveSetsToServers(servers: ManagedServerRecord[], sets: ManagedSetRecord[], activeSetIds: string[]): ManagedServerRecord[];
/** Remove one server membership from every Set without mutating the input. */
export declare function removeServerFromSets(sets: ManagedSetRecord[], serverId: string): ManagedSetRecord[];
export declare class ProfileSetStore {
    readonly path: string;
    constructor(path: string);
    private readText;
    read(): Promise<SetStoreSnapshot>;
    write(sets: ManagedSetRecord[], activeSetIds?: string[]): Promise<SetStoreSnapshot>;
}
//# sourceMappingURL=set-store.d.ts.map
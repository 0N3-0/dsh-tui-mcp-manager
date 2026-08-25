import type { ManagedServerRecord } from './types.js';
declare const META_KEY = "x-dsh-mcp-manager";
interface ManagedMetadata {
    id: string;
    name?: string;
}
export interface ManagedLoaderEntry {
    id: string;
    name: string;
    disabled?: boolean;
    config: Record<string, unknown>;
    [META_KEY]: ManagedMetadata;
}
export interface PatchStoreSnapshot {
    servers: ManagedServerRecord[];
    hasManagedBlock: boolean;
    needsAdapterMigration: boolean;
    writable: boolean;
    path: string;
}
export declare function loaderRowId(id: string): string;
export declare function toLoaderEntry(input: ManagedServerRecord): ManagedLoaderEntry;
export declare class ProfilePatchStore {
    readonly path: string;
    constructor(path: string);
    private readText;
    read(): Promise<PatchStoreSnapshot>;
    write(servers: ManagedServerRecord[]): Promise<PatchStoreSnapshot>;
}
export {};
//# sourceMappingURL=patch-store.d.ts.map
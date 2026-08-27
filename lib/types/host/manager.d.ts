import { Service, type Context } from '@deepseek-ai/cordis';
import { type McpDoctorReport, type McpManagerSnapshot } from './types.js';
/**
 * File-backed MCP manager.
 *
 * The active profile's `cordis.patch.yml` is the sole configuration source.
 * DSH's patch watcher and Cordis Loader own activation, HMR, disable and
 * disposal. This service edits only its marked block and projects runtime
 * state to the Web/TUI front doors.
 */
export declare class McpManagerService extends Service {
    static inject: string[];
    private readonly profile;
    private readonly store?;
    private readonly setStore?;
    private legacySettings?;
    private readonly records;
    private readonly changeListeners;
    private revision;
    private changeNotificationQueued;
    private chain;
    private lastStorage?;
    constructor(ctx: Context);
    /**
     * Subscribe to manager-owned state changes.
     *
     * Renderers still perform a low-frequency file refresh because profile files
     * may be edited outside this process. This feed covers mutations, Loader
     * projections, tool-registry changes, and reconnect transitions immediately.
     */
    subscribe(listener: () => void): () => void;
    private bumpRevision;
    /** Register the old section read-only so an existing install can migrate once. */
    private installLegacySettingsMigration;
    private installToolRegistryTracking;
    private installPatchFailureTracking;
    private installRpcChannel;
    private enqueue;
    private requireStore;
    private legacyServers;
    private readStorage;
    private writeServers;
    private readSets;
    private writeSets;
    private loaderEntries;
    private loaderEntry;
    private assertNoExternalNamespaceConflict;
    private entryMatches;
    private syncFromFile;
    private touch;
    private toolsFor;
    /** Reconcile the cached view with the native registry without inventing a state transition. */
    private refreshTools;
    invoke(endpoint: string, payload: unknown): Promise<McpManagerSnapshot>;
    /**
     * Diagnose one server without opening another MCP transport. Runtime checks
     * are projections of the Loader-owned client already running in this host.
     */
    doctor(id: string): Promise<McpDoctorReport>;
    private dispatchRpc;
    private reconnectServer;
    private credentialState;
    private resolvedSecrets;
    private redact;
    private viewFor;
    private snapshot;
}
//# sourceMappingURL=manager.d.ts.map
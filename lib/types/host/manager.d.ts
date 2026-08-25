import { Service, type Context } from '@deepseek-ai/cordis';
import { type McpManagerSnapshot } from './types.js';
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
    private legacySettings?;
    private readonly records;
    private revision;
    private chain;
    private lastStorage?;
    constructor(ctx: Context);
    /** Register the old section read-only so an existing install can migrate once. */
    private installLegacySettingsMigration;
    private installLogCapture;
    private installToolRegistryTracking;
    private installCredentialTracking;
    private installPatchFailureTracking;
    private installRpcChannel;
    private enqueue;
    private requireStore;
    private legacyServers;
    private readStorage;
    private writeServers;
    private loaderEntries;
    private loaderEntry;
    private assertNoExternalNamespaceConflict;
    private entryMatches;
    private syncFromFile;
    private touch;
    private toolsFor;
    /** Reconcile the cached view with the native registry without inventing a state transition. */
    private refreshTools;
    private applyLogTransition;
    invoke(endpoint: string, payload: unknown): Promise<McpManagerSnapshot>;
    private dispatchRpc;
    private persistEnabled;
    private reconnectServer;
    private credentialState;
    private resolvedSecrets;
    private refreshRedactionTokens;
    private redact;
    private viewFor;
    private snapshot;
}
//# sourceMappingURL=manager.d.ts.map
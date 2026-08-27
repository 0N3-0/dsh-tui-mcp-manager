import type { ManagedServerRecord, McpManagerSnapshot, McpServerView, SecretHeaderRef } from '../host/types.js';
export type ServerFormIntent = 'create' | 'edit' | 'duplicate';
export interface ServerFormDraft {
    id: string;
    displayName: string;
    serverName: string;
    transport: ManagedServerRecord['transport'];
    command: string;
    args: string;
    cwd: string;
    env: string;
    secretEnv: string;
    url: string;
    headers: string;
    secretHeaders: string;
    enabled: boolean;
    toolCallTimeoutMs: string;
    failOnStartupError: boolean;
    reconnectEnabled: boolean;
    reconnectInitialDelayMs: string;
    reconnectMaxDelayMs: string;
    reconnectMaxAttempts: string;
    credentialValues: Record<string, string>;
}
export interface ServerFormSubmission {
    record: ManagedServerRecord;
    credentialValues: Record<string, string>;
}
export type ServerFormIssue = 'invalid-id' | 'duplicate-id' | 'invalid-server-name' | 'duplicate-server-name' | 'invalid-command' | 'invalid-url' | 'invalid-pairs' | 'plain-secret-env' | 'invalid-credential-refs' | 'plain-secret-headers' | 'invalid-secret-headers' | 'invalid-positive-number' | 'invalid-positive-integer' | 'invalid-reconnect-delays';
export declare function nextServerId(snapshot: McpManagerSnapshot): string;
export declare function nextDuplicateId(snapshot: McpManagerSnapshot, source: string): string;
export declare function nextDuplicateServerName(snapshot: McpManagerSnapshot, source: string): string;
export declare function createServerDraft(snapshot: McpManagerSnapshot, intent: ServerFormIntent, existing?: McpServerView, language?: 'zh' | 'en'): ServerFormDraft;
export declare function credentialReferences(draft: ServerFormDraft): string[];
export declare function positiveNumber(value: string): number | undefined;
export declare function positiveInteger(value: string): number | undefined;
export declare function validateServerDraft(draft: ServerFormDraft, snapshot: McpManagerSnapshot, intent: ServerFormIntent, originalId?: string): ServerFormIssue | undefined;
export declare function buildServerSubmission(draft: ServerFormDraft): ServerFormSubmission;
export declare function parseAssignments(value: string): Array<[string, string]> | undefined;
export declare function isPairMap(value: string): boolean;
export declare function parsePairs(value: string): Record<string, string>;
export declare function hasPlainSecretHeader(value: string): boolean;
export declare function hasPlainSecretEnv(value: string): boolean;
export declare function isCredentialRefMap(value: string): boolean;
export declare function parseCredentialRefs(value: string): Record<string, string>;
export declare function formatEquals(value?: Record<string, string>): string;
/**
 * Parse one compact secret-header entry. The final token is a credential
 * reference; text before it (including whitespace) is the literal prefix.
 */
export declare function parseSecretHeaderSpec(spec: string): SecretHeaderRef | undefined;
export declare function isSecretHeaderMap(value: string): boolean;
export declare function parseSecretHeaders(value: string): Record<string, SecretHeaderRef>;
export declare function formatSecretHeaders(value?: Record<string, SecretHeaderRef>): string;
export declare function parseArgs(value: string): string[];
export declare function formatArgs(value?: string[]): string;
//# sourceMappingURL=server-form-model.d.ts.map
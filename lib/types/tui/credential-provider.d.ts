import { credentialRef, type CredentialInfo } from '@deepseek-ai/dsh-credentials';
export interface CredentialProviderFace {
    describe(ref: ReturnType<typeof credentialRef>): Promise<CredentialInfo>;
    set(ref: ReturnType<typeof credentialRef>, value: string): Promise<void>;
}
export declare function persistCredentialValues(credentials: CredentialProviderFace, values: Record<string, string>): Promise<void>;
export { credentialRef };
//# sourceMappingURL=credential-provider.d.ts.map
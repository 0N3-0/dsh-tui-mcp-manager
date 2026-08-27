import { credentialRef } from '@deepseek-ai/dsh-credentials';
export async function persistCredentialValues(credentials, values) {
    for (const [ref, value] of Object.entries(values)) {
        await credentials.set(credentialRef(ref), value);
    }
}
export { credentialRef };
//# sourceMappingURL=credential-provider.js.map
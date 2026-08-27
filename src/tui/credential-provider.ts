import { credentialRef, type CredentialInfo } from '@deepseek-ai/dsh-credentials'

export interface CredentialProviderFace {
  describe(ref: ReturnType<typeof credentialRef>): Promise<CredentialInfo>
  set(ref: ReturnType<typeof credentialRef>, value: string): Promise<void>
}

export async function persistCredentialValues(
  credentials: CredentialProviderFace,
  values: Record<string, string>,
): Promise<void> {
  for (const [ref, value] of Object.entries(values)) {
    await credentials.set(credentialRef(ref), value)
  }
}

export { credentialRef }

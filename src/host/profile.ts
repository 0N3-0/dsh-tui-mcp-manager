import type { Context } from '@deepseek-ai/cordis'
import { resolveDshHome } from '@deepseek-ai/dsh-home-paths'
import { fileURLToPath } from 'node:url'
import { isAbsolute, join, relative, sep } from 'node:path'

export interface ProfileIdentity {
  key: string
  source: 'profileContext' | 'ctx.baseUrl' | 'fallback'
  dir?: string
  patchPath?: string
}

/**
 * Resolve the DSH profile this process booted.
 *
 * Current DSH profiles expose their identity through `ctx.profileContext`.
 * Keep the validated Loader baseUrl path for standalone compositions that
 * mount this plugin without the profile service.
 */
export function detectProfile(ctx: Context): ProfileIdentity {
  const profile = (ctx as unknown as { get(name: string, fallback: false): unknown })
    .get('profileContext', false) as { name?: unknown; dir?: unknown; patchPath?: unknown } | undefined
  if (profile && typeof profile.name === 'string' && profile.name !== ''
    && typeof profile.dir === 'string' && isAbsolute(profile.dir)
    && typeof profile.patchPath === 'string' && isAbsolute(profile.patchPath)) {
    return { key: profile.name, source: 'profileContext', dir: profile.dir, patchPath: profile.patchPath }
  }
  const baseUrl = ctx.baseUrl
  if (baseUrl !== undefined) {
    try {
      const dir = fileURLToPath(baseUrl)
      const profilesRoot = join(resolveDshHome(), 'profiles')
      const rel = relative(profilesRoot, dir)
      if (rel !== '' && !rel.startsWith('..') && !isAbsolute(rel)) {
        const name = rel.split(sep)[0]
        if (name !== '' && name !== 'node_modules') {
          const profileDir = join(profilesRoot, name)
          return {
            key: name,
            source: 'ctx.baseUrl',
            dir: profileDir,
            patchPath: join(profileDir, 'cordis.patch.yml'),
          }
        }
      }
    } catch {
      // fall through to the safe default
    }
  }
  return { key: 'default', source: 'fallback' }
}

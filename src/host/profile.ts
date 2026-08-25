import type { Context } from '@deepseek-ai/cordis'
import { resolveDshHome } from '@deepseek-ai/dsh-home-paths'
import { fileURLToPath } from 'node:url'
import { isAbsolute, join, relative, sep } from 'node:path'

export interface ProfileIdentity {
  key: string
  source: 'ctx.baseUrl' | 'fallback'
  dir?: string
  patchPath?: string
}

/**
 * Resolve the DSH profile this process booted.
 *
 * `dsh --profile <name>` anchors the Loader's `ctx.baseUrl` at
 * `$DSH_HOME/profiles/<name>/`; that anchor is the only public context fact
 * naming the active profile today. There is no dedicated `ctx.profile`
 * service yet (see README: upstream extension candidates), so this helper
 * validates that the anchor really sits under `$DSH_HOME/profiles` before
 * trusting it and otherwise falls back to a shared `default` section.
 */
export function detectProfile(ctx: Context): ProfileIdentity {
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

import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import * as yaml from 'js-yaml'

const manifest = JSON.parse(await readFile(new URL('../dsh-plugin.json', import.meta.url), 'utf8'))
const pkg = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'))

assert.equal(manifest.$schema, 'https://dsh.community/schemas/dsh-plugin-0.15.json')
assert.equal(manifest.manifestVersion, '0.15')
assert.equal(manifest.name, pkg.name)
assert.equal(manifest.version, pkg.version)
assert.deepEqual(manifest.subscriptions, [])
assert.equal(manifest.facets.host.entry, 'lib/types/index.js')
assert.equal(manifest.contributes.commands[0].id, 'dsh-tui.mcp-manager')
assert.equal(manifest.permissions[0].name, 'commands.invoke')
assert.equal(manifest.permissions[0].scope, 'dsh-tui.mcp-manager')
assert.equal(manifest.compat.hosts[0], '@deepseek-harness-tui/dsh-tui >=0.9.2 <0.10.0')

assert.equal(pkg.main, `./${manifest.facets.host.entry}`)
assert.equal(pkg.exports['.'].import, pkg.main)
assert.equal(pkg.dsh.bundle.patch, './cordis.patch.yml')
assert.equal(pkg.peerDependencies['@deepseek-harness-tui/dsh-tui'], '^0.9.2')
assert.equal(pkg.scripts.prepare, undefined)
assert.equal(pkg.scripts.prepack, 'npm run check')
for (const required of ['lib', 'cordis.patch.yml', 'dsh-plugin.json', 'README.md', 'README_EN.md', 'LICENSE']) {
  assert.ok(pkg.files.includes(required), `package files must include ${required}`)
}

const patch = yaml.load(await readFile(new URL('../cordis.patch.yml', import.meta.url), 'utf8'))
assert.ok(Array.isArray(patch))
assert.equal(patch[0]?.insert?.[0]?.name, pkg.name)
assert.equal(manifest.overrides[0]?.target, 'cordis.patch.yml')

const entry = await readFile(new URL('../lib/types/index.js', import.meta.url), 'utf8')
assert.match(entry, /const name = ['"]dsh-tui-mcp-manager['"]/)
assert.match(entry, /export const Config\s*=/)
assert.match(entry, /export function apply\s*\(/)
assert.doesNotMatch(entry, /export default/)

const { ProfileSetStore, applyActiveSetsToServers } = await import('../lib/types/host/set-store.js')
const temp = await mkdtemp(join(tmpdir(), 'dsh-tui-mcp-manager-'))
try {
  const store = new ProfileSetStore(join(temp, 'mcp-manager.sets.yml'))
  await store.write([
    { id: 'research', name: 'Research', serverIds: ['context7', 'shared'] },
    { id: 'extra', name: 'Extra', serverIds: ['ghgrep', 'shared'] },
  ], ['research', 'extra'])
  const stored = await store.read()
  assert.deepEqual(stored.sets.map((set) => set.id), ['research', 'extra'])
  assert.deepEqual(stored.activeSetIds, ['research', 'extra'])
  assert.equal(stored.initialized, true)

  const servers = [
    { id: 'context7', enabled: false },
    { id: 'ghgrep', enabled: false },
    { id: 'shared', enabled: false },
    { id: 'unassigned', enabled: true },
  ]
  assert.deepEqual(
    applyActiveSetsToServers(servers, stored.sets, ['research', 'extra']).map((server) => server.enabled),
    [true, true, true, false],
  )
  assert.deepEqual(
    applyActiveSetsToServers(servers, stored.sets, ['extra']).map((server) => server.enabled),
    [false, true, true, false],
  )
  const noActiveSets = applyActiveSetsToServers(servers, stored.sets, [])
  assert.deepEqual(noActiveSets.map((server) => server.enabled), [false, false, false, false])
  assert.equal(noActiveSets.filter((server) => server.id === 'shared').length, 1)
  assert.throws(
    () => applyActiveSetsToServers(servers, [{ id: 'bad', name: 'Bad', serverIds: ['missing'] }], ['bad']),
    /unknown server/,
  )
  await store.write(stored.sets, [])
  assert.equal((await store.read()).initialized, true)
} finally {
  await rm(temp, { recursive: true, force: true })
}

console.log('verified package lifecycle, manifest, Cordis entry contract, and multi-active MCP set union')

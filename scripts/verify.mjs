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

const tuiEntry = await readFile(new URL('../lib/types/tui/index.js', import.meta.url), 'utf8')
assert.match(tuiEntry, /tuiScenes/)
assert.match(tuiEntry, /tuiDialogs/)
assert.doesNotMatch(
  tuiEntry,
  /inject\(\[['"]tuiScenes['"]\]/,
  'scene registration and command execution must share one Cordis activation',
)
assert.match(tuiEntry, /const scenes = tuiCtx\.get\?\.\(['"]tuiScenes['"], false\)/)
const sceneEntry = await readFile(new URL('../lib/types/tui/scene.js', import.meta.url), 'utf8')
assert.doesNotMatch(sceneEntry, /\bScrollBox\s*[,)]|ink-box/)
assert.match(sceneEntry, /overflow: ['"]hidden['"]/)
assert.match(sceneEntry, /top: -visibleDetailScrollTop/)
assert.match(sceneEntry, /renderServerEditorView/)
assert.doesNotMatch(sceneEntry, /function serverFieldLabel/)
const serverEditorView = await readFile(new URL('../lib/types/tui/scene-server-editor.js', import.meta.url), 'utf8')
assert.match(serverEditorView, /function serverFieldLabel/)
assert.match(serverEditorView, /React\.createElement/)
const managerEntry = await readFile(new URL('../lib/types/host/manager.js', import.meta.url), 'utf8')
assert.match(managerEntry, /subscribe\(listener\)/)
const presentation = await import('../lib/types/tui/presentation.js')
assert.equal(presentation.runtimeStateText('zh', 'connected'), '已连接')
assert.equal(presentation.doctorCheckStringKey('credentials'), 'doctorCredentials')
assert.equal(presentation.doctorSuggestionStringKey('check-auth'), 'suggestCheckAuth')

const serverForm = await import('../lib/types/tui/server-form-model.js')
assert.deepEqual(serverForm.parseArgs('node "two words" --flag'), ['node', 'two words', '--flag'])
assert.deepEqual(serverForm.parsePairs('A=one, B=two'), { A: 'one', B: 'two' })
const emptySnapshot = {
  revision: 0,
  profile: { key: 'test', source: 'ctx.baseUrl' },
  storage: { available: true, writable: true, managedBlock: true },
  servers: [],
  sets: [],
  activeSetIds: [],
}
const httpDraft = serverForm.createServerDraft(emptySnapshot, 'create')
Object.assign(httpDraft, {
  id: 'context7',
  displayName: 'Context7',
  serverName: 'context7',
  transport: 'streamable-http',
  url: 'https://mcp.context7.com/mcp',
  headers: '',
  secretHeaders: 'api-key=CONTEXT7_API_KEY',
  credentialValues: { CONTEXT7_API_KEY: 'not-persisted-in-loader-row' },
})
assert.equal(serverForm.validateServerDraft(httpDraft, emptySnapshot, 'create'), undefined)
const httpSubmission = serverForm.buildServerSubmission(httpDraft)
assert.deepEqual(httpSubmission.record.secretHeaders, {
  'api-key': { ref: 'CONTEXT7_API_KEY' },
})
assert.equal(JSON.stringify(httpSubmission.record).includes('not-persisted-in-loader-row'), false)
assert.deepEqual(httpSubmission.credentialValues, {
  CONTEXT7_API_KEY: 'not-persisted-in-loader-row',
})
httpDraft.headers = 'api-key=plain-text-secret'
assert.equal(serverForm.validateServerDraft(httpDraft, emptySnapshot, 'create'), 'plain-secret-headers')
httpDraft.headers = ''

const {
  ProfileSetStore,
  applyActiveSetsToServers,
  removeServerFromSets,
} = await import('../lib/types/host/set-store.js')
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
  const withoutShared = removeServerFromSets(stored.sets, 'shared')
  assert.deepEqual(withoutShared.map((set) => set.serverIds), [['context7'], ['ghgrep']])
  assert.equal(stored.sets.every((set) => set.serverIds.includes('shared')), true, 'server removal must not mutate the input Sets')

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

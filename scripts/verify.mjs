import assert from 'node:assert/strict'
import { mkdir, mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
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
const sceneControllerEntry = await readFile(new URL('../lib/types/tui/scene-controller.js', import.meta.url), 'utf8')
assert.doesNotMatch(sceneEntry, /\bScrollBox\s*[,)]|ink-box/)
assert.match(sceneEntry, /overflow: ['"]hidden['"]/)
assert.match(sceneEntry, /top: -visibleDetailScrollTop/)
assert.match(sceneEntry, /renderServerEditorView/)
assert.match(sceneEntry, /renderServerDetailView/)
assert.match(sceneEntry, /renderSetDetailView/)
assert.match(sceneEntry, /renderSetEditorView/)
assert.doesNotMatch(sceneEntry, /function serverFieldLabel/)
assert.doesNotMatch(sceneEntry, /function yesNo|function json/)
const serverDetailView = await readFile(new URL('../lib/types/tui/scene-server-detail.js', import.meta.url), 'utf8')
assert.match(serverDetailView, /function renderServerDetailView/)
assert.match(serverDetailView, /function serverStateGlyph/)
assert.match(serverDetailView, /doctorCheckLabel/)
const setDetailView = await readFile(new URL('../lib/types/tui/scene-set-detail.js', import.meta.url), 'utf8')
assert.match(setDetailView, /function renderSetDetailView/)
assert.match(setDetailView, /function renderSetEditorView/)
assert.match(setDetailView, /runtimeStateText/)
const serverEditorView = await readFile(new URL('../lib/types/tui/scene-server-editor.js', import.meta.url), 'utf8')
assert.match(serverEditorView, /function serverFieldLabel/)
assert.match(serverEditorView, /React\.createElement/)
const serverEditorController = await import('../lib/types/tui/scene-server-editor-controller.js')
const setEditorController = await import('../lib/types/tui/scene-set-editor-controller.js')
assert.match(sceneControllerEntry, /useSetEditorController/)
assert.doesNotMatch(sceneControllerEntry, /invalidSetId|function moveSetEditorSelection/)
const managerEntry = await readFile(new URL('../lib/types/host/manager.js', import.meta.url), 'utf8')
assert.match(managerEntry, /subscribe\(listener\)/)
const presentation = await import('../lib/types/tui/presentation.js')
const sceneModel = await import('../lib/types/tui/scene-model.js')
assert.equal(presentation.runtimeStateText('zh', 'connected'), '已连接')
assert.equal(presentation.doctorCheckStringKey('credentials'), 'doctorCredentials')
assert.equal(presentation.doctorSuggestionStringKey('check-auth'), 'suggestCheckAuth')
const manyTools = Array.from({ length: 120 }, (_, index) => `tool-${index}`)
assert.deepEqual(sceneModel.indexedWindow(manyTools, 0, 10), {
  start: 0,
  items: manyTools.slice(0, 10),
})
assert.deepEqual(sceneModel.indexedWindow(manyTools, 119, 10), {
  start: 110,
  items: manyTools.slice(110),
})
assert.deepEqual(sceneModel.indexedWindow(manyTools, 60, 9), {
  start: 56,
  items: manyTools.slice(56, 65),
})

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
const httpRows = serverEditorController.serverEditorRowsFor({
  intent: 'create',
  draft: httpDraft,
  selected: 0,
})
assert.equal(httpRows.some((row) => row.kind === 'field' && row.field === 'url'), true)
assert.equal(httpRows.some((row) => row.kind === 'field' && row.field === 'command'), false)
assert.deepEqual(httpRows.filter((row) => row.kind === 'credential').map((row) => row.ref), ['CONTEXT7_API_KEY'])
const setRows = setEditorController.setEditorRowsFor({
  mode: 'create',
  draft: { id: 'set-1', name: '', serverIds: [] },
  selected: 0,
}, [{ id: 'context7', name: 'Context7' }])
assert.deepEqual(setRows.slice(0, 2), [
  { kind: 'field', field: 'id', editable: true },
  { kind: 'field', field: 'name', editable: true },
])
assert.equal(setRows.some((row) => row.kind === 'member' && row.server.id === 'context7'), true)

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

  // Exercise the authoritative refresh used by the Scene's low-frequency
  // poll without touching a real DSH profile. A second store instance stands
  // in for an editor/process changing the profile while the Scene is open.
  const previousDshHome = process.env.DSH_HOME
  try {
    process.env.DSH_HOME = temp
    const profileDir = join(temp, 'profiles', 'external-edit')
    const patchPath = join(profileDir, 'cordis.patch.yml')
    await mkdir(profileDir, { recursive: true })
    const { Context } = await import('@deepseek-ai/cordis')
    const { McpManagerService } = await import('../lib/types/host/manager.js')
    const { ProfilePatchStore } = await import('../lib/types/host/patch-store.js')
    const externalPatchStore = new ProfilePatchStore(patchPath)
    const server = {
      id: 'external',
      name: 'Before external edit',
      serverName: 'external',
      transport: 'stdio',
      enabled: true,
      command: 'before',
      args: [],
      env: {},
      secretEnv: {},
      toolCallTimeoutMs: 60_000,
      failOnStartupError: false,
      reconnect: { enabled: true, initialDelayMs: 500, maxDelayMs: 30_000, maxAttempts: 10 },
    }
    await externalPatchStore.write([server])

    const ctx = new Context().extend({ baseUrl: pathToFileURL(`${profileDir}/`).href })
    ctx.provide('tools', { schemas: () => [] })
    ctx.provide('loader', { entries: () => [] })
    const manager = new McpManagerService(ctx)
    const beforeExternalEdit = await manager.invoke('list', {})
    assert.equal(beforeExternalEdit.profile.key, 'external-edit')
    assert.equal(beforeExternalEdit.servers[0]?.name, 'Before external edit')

    await new ProfilePatchStore(patchPath).write([{
      ...server,
      name: 'After external edit',
      command: 'after',
    }])
    const afterExternalPatchEdit = await manager.invoke('list', {})
    assert.equal(afterExternalPatchEdit.servers[0]?.name, 'After external edit')
    assert.equal(afterExternalPatchEdit.servers[0]?.command, 'after')
    assert.ok(afterExternalPatchEdit.revision > beforeExternalEdit.revision)

    await new ProfileSetStore(join(profileDir, 'mcp-manager.sets.yml')).write([
      { id: 'external-set', name: 'Externally edited Set', serverIds: ['external'] },
    ], ['external-set'])
    const afterExternalSetEdit = await manager.invoke('list', {})
    assert.deepEqual(afterExternalSetEdit.sets.map((set) => set.name), ['Externally edited Set'])
    assert.deepEqual(afterExternalSetEdit.activeSetIds, ['external-set'])
  } finally {
    if (previousDshHome === undefined) delete process.env.DSH_HOME
    else process.env.DSH_HOME = previousDshHome
  }
} finally {
  await rm(temp, { recursive: true, force: true })
}

console.log('verified package lifecycle, manifest, Cordis entry contract, Set union, and external profile refresh')

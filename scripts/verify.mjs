import assert from 'node:assert/strict'
import { mkdir, mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import * as yaml from 'js-yaml'

const manifest = JSON.parse(await readFile(new URL('../dsh-plugin.json', import.meta.url), 'utf8'))
const pkg = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'))
const publishWorkflowText = await readFile(new URL('../.github/workflows/publish.yml', import.meta.url), 'utf8')
const publishWorkflow = yaml.load(publishWorkflowText)

assert.equal(manifest.$schema, 'https://dsh.community/schemas/dsh-plugin-0.15.json')
assert.equal(manifest.manifestVersion, '0.15')
assert.equal(manifest.name, pkg.name)
assert.equal(manifest.version, pkg.version)
assert.deepEqual(manifest.subscriptions, [])
assert.equal(manifest.facets.host.entry, 'lib/types/index.js')
assert.equal(manifest.contributes.commands[0].id, 'dsh-tui.mcp-manager')
assert.equal(manifest.permissions[0].name, 'commands.invoke')
assert.equal(manifest.permissions[0].scope, 'dsh-tui.mcp-manager')
assert.equal(manifest.compat.hosts[0], '@deepseek-harness-tui/dsh-tui >=0.9.3 <0.10.0')

assert.equal(pkg.main, `./${manifest.facets.host.entry}`)
assert.equal(pkg.exports['.'].import, pkg.main)
assert.equal(pkg.dsh.bundle.patch, './cordis.patch.yml')
assert.equal(pkg.peerDependencies['@deepseek-harness-tui/dsh-tui'], '^0.9.3')
assert.equal(pkg.scripts.prepare, undefined)
assert.equal(pkg.scripts.prepack, 'npm run check')
assert.equal(pkg.scripts['verify:release'], 'node scripts/verify-release.mjs')
for (const required of ['lib', 'cordis.patch.yml', 'dsh-plugin.json', 'README.md', 'README_EN.md', 'LICENSE']) {
  assert.ok(pkg.files.includes(required), `package files must include ${required}`)
}

assert.deepEqual(publishWorkflow.on.release.types, ['published'])
assert.equal(publishWorkflow.permissions.contents, 'read')
assert.equal(publishWorkflow.permissions['id-token'], 'write')
assert.equal(publishWorkflow.jobs.npm['runs-on'], 'ubuntu-latest')
assert.match(publishWorkflowText, /npm publish --access public/)
assert.doesNotMatch(publishWorkflowText, /NODE_AUTH_TOKEN|NPM_TOKEN/)
const workflowScripts = [...publishWorkflowText.matchAll(/npm run ([A-Za-z0-9:_-]+)/g)].map((match) => match[1])
assert.deepEqual([...new Set(workflowScripts)], ['verify:release', 'check', 'smoke:package'])
for (const script of workflowScripts) {
  assert.equal(typeof pkg.scripts[script], 'string', `publish workflow references missing npm script ${script}`)
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
assert.doesNotMatch(tuiEntry, /tuiDialogs|runManager|TuiDialogRuntime/)
assert.match(tuiEntry, /inject\(\[['"]tuiScenes['"]\]/)
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
const searchInputView = await readFile(new URL('../lib/types/tui/scene-search-input.js', import.meta.url), 'utf8')
assert.match(serverDetailView, /function renderServerDetailView/)
assert.match(serverDetailView, /function serverStateGlyph/)
assert.match(serverDetailView, /doctorCheckLabel/)
assert.match(serverDetailView, /setMembership/)
assert.match(serverDetailView, /serverIds\.includes\(server\.id\)/)
assert.match(serverDetailView, /SceneSearchInput/)
assert.match(serverDetailView, /beginSearch: beginToolSearch/)
assert.match(searchInputView, /function SceneSearchInput/)
assert.match(searchInputView, /\\uf002/)
assert.match(searchInputView, /inverse: true/)
assert.match(searchInputView, /process\.stdout\.write/)
assert.match(searchInputView, /backgroundColor: ['"]toolCardBackgroundDim['"]/)
assert.match(searchInputView, /textCursorSegments/)
assert.match(sceneEntry, /beginSearch: beginNavSearch/)
assert.match(sceneEntry, /navItems\.length.*navTotal/)
const setDetailView = await readFile(new URL('../lib/types/tui/scene-set-detail.js', import.meta.url), 'utf8')
assert.match(setDetailView, /function renderSetDetailView/)
assert.match(setDetailView, /function renderSetEditorView/)
assert.match(setDetailView, /runtimeStateText/)
assert.match(setDetailView, /activateMember/)
assert.match(sceneControllerEntry, /selectedSet\.serverIds\.length \+ 3/)
assert.match(sceneControllerEntry, /next - selectedSet\.serverIds\.length/)
const serverEditorView = await readFile(new URL('../lib/types/tui/scene-server-editor.js', import.meta.url), 'utf8')
assert.match(serverEditorView, /function serverFieldLabel/)
assert.match(serverEditorView, /React\.createElement/)
const serverEditorController = await import('../lib/types/tui/scene-server-editor-controller.js')
const setEditorController = await import('../lib/types/tui/scene-set-editor-controller.js')
assert.match(sceneControllerEntry, /useSetEditorController/)
assert.doesNotMatch(sceneControllerEntry, /invalidSetId|function moveSetEditorSelection/)
assert.match(sceneControllerEntry, /setNotice\(announcement\)/)
assert.match(sceneControllerEntry, /\}, \[manager\]\)/)
const sceneStartOffset = sceneControllerEntry.indexOf('const start = async')
const initialRefreshOffset = sceneControllerEntry.indexOf('await refresh()', sceneStartOffset)
const subscribeOffset = sceneControllerEntry.indexOf('manager.subscribe', sceneStartOffset)
assert.ok(sceneStartOffset >= 0 && initialRefreshOffset > sceneStartOffset && subscribeOffset > initialRefreshOffset)
const managerEntry = await readFile(new URL('../lib/types/host/manager.js', import.meta.url), 'utf8')
assert.match(managerEntry, /subscribe\(listener\)/)
const presentation = await import('../lib/types/tui/presentation.js')
const sceneI18n = await import('../lib/types/tui/scene-i18n.js')
const sceneModel = await import('../lib/types/tui/scene-model.js')
assert.equal(presentation.runtimeStateText('zh', 'connected'), '已连接')
assert.equal(presentation.doctorCheckStringKey('credentials'), 'doctorCredentials')
assert.equal(presentation.doctorSuggestionStringKey('check-auth'), 'suggestCheckAuth')
assert.equal(sceneI18n.doctorCheckDetail('zh', {
  id: 'runtime',
  state: 'pass',
  detail: 'reachable',
}), '可连接')
assert.equal(sceneI18n.doctorCheckDetail('zh', {
  id: 'tools',
  state: 'pass',
  detail: '66 tool(s) discovered during temporary activation',
}), '66 个工具')
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
assert.deepEqual(sceneModel.insertAtTextCursor('abcd', 2, 'XYZ', 5), {
  value: 'abXcd',
  cursor: 3,
})
assert.deepEqual(sceneModel.insertAtTextCursor('a你c', 2, '好', 8), {
  value: 'a你好c',
  cursor: 3,
})
assert.deepEqual(sceneModel.removeBeforeTextCursor('a你bc', 3), {
  value: 'a你c',
  cursor: 2,
})
assert.deepEqual(sceneModel.removeAtTextCursor('a你bc', 1), {
  value: 'abc',
  cursor: 1,
})
assert.deepEqual(sceneModel.textCursorSegments('a你c', 2), {
  before: 'a你',
  cursor: 'c',
  after: '',
})
assert.deepEqual(sceneModel.textCursorSegments('secret', 3, 12, true), {
  before: '•••',
  cursor: '•',
  after: '••',
})
assert.deepEqual(sceneModel.textCursorSegments('abc', 3), {
  before: 'abc',
  cursor: ' ',
  after: '',
})
assert.equal(sceneModel.terminalTextWidth('\uf002 '), 2)
assert.equal(sceneModel.terminalTextWidth('a你c'), 4)
assert.equal(sceneModel.truncateTerminalText('a你bc', 4), 'a你…')
const narrowCursor = sceneModel.textCursorSegments('一二三四五六', 3, 8)
assert.ok(sceneModel.terminalTextWidth(`${narrowCursor.before}${narrowCursor.cursor}${narrowCursor.after}`) <= 8)
assert.notEqual(sceneModel.textCursorSegments('abcdefghijklmnopqrstuvwxyz', 13, 12).cursor, '')
assert.equal(sceneModel.matchesSearch('IDA query', 'mcp__ida__func_query', 'Query IDA functions'), true)
assert.equal(sceneModel.matchesSearch('ida missing', 'mcp__ida__func_query', 'Query IDA functions'), false)
assert.equal(sceneModel.matchesSearch('  ', 'anything'), true)
assert.equal(sceneModel.matchesNavItem('context ctx', {
  kind: 'server',
  key: 'server:context7',
  server: { id: 'context7', name: 'Context docs', serverName: 'ctx' },
}), true)
assert.equal(sceneModel.matchesNavItem('default', {
  kind: 'set',
  key: 'set:default',
  set: { id: 'default', name: 'Default', serverIds: [], active: true },
}), true)
assert.equal(sceneModel.matchesNavItem('missing', {
  kind: 'set',
  key: 'set:default',
  set: { id: 'default', name: 'Default', serverIds: [], active: true },
}), false)

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
const serverEditorModule = await import('../lib/types/tui/scene-server-editor.js')
assert.match(serverEditorModule.serverEditorSelectionHelp('zh', {
  intent: 'create',
  draft: httpDraft,
  selected: 0,
}, httpRows), /稳定 ID/)
assert.match(serverEditorModule.serverEditorSelectionHelp('zh', {
  intent: 'create',
  draft: httpDraft,
  selected: 1,
}, httpRows), /留空/)
const setRows = setEditorController.setEditorRowsFor({
  mode: 'create',
  draft: { id: 'set-1', name: '', serverIds: [], active: false },
  selected: 0,
  memberFilter: '',
}, [{ id: 'context7', name: 'Context7' }])
assert.deepEqual(setRows.slice(0, 2), [
  { kind: 'field', field: 'id', editable: true },
  { kind: 'field', field: 'name', editable: true },
])
assert.deepEqual(setRows[2], { kind: 'boolean', field: 'active' })
assert.deepEqual(setRows[3], { kind: 'search' })
assert.equal(setRows.some((row) => row.kind === 'member' && row.server.id === 'context7'), true)
const filteredSetRows = setEditorController.setEditorRowsFor({
  mode: 'create',
  draft: { id: 'set-1', name: '', serverIds: [], active: false },
  selected: 3,
  memberFilter: 'missing',
}, [{ id: 'context7', name: 'Context7' }])
assert.equal(filteredSetRows.some((row) => row.kind === 'member'), false)
const setEditorView = await import('../lib/types/tui/scene-set-detail.js')
assert.match(setEditorView.setEditorSelectionHelp('zh', {
  mode: 'create',
  draft: { id: 'set-1', name: '', serverIds: [], active: false },
  selected: 2,
  memberFilter: '',
}, setRows), /下次启动/)
assert.match(setEditorView.setEditorSelectionHelp('zh', {
  mode: 'create',
  draft: { id: 'set-1', name: '', serverIds: [], active: false },
  selected: 3,
  memberFilter: '',
}, setRows), /过滤服务器/)

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
    const { ProfilePatchStore, toLoaderEntry } = await import('../lib/types/host/patch-store.js')
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
    const companionServer = {
      ...server,
      id: 'companion',
      name: 'Companion',
      serverName: 'companion',
    }
    await externalPatchStore.write([server, companionServer])

    const ctx = new Context().extend({ baseUrl: pathToFileURL(`${profileDir}/`).href })
    let toolSchemaReads = 0
    let diagnosticTools = []
    ctx.provide('tools', { schemas: () => {
      toolSchemaReads += 1
      return diagnosticTools
    } })
    const loaderUpdates = []
    const fakeEntry = {
      options: toLoaderEntry(server),
      fiber: undefined,
      async update(options) {
        loaderUpdates.push(structuredClone(options))
        this.options = { ...this.options, ...options }
        if (this.options.disabled) {
          this.fiber = undefined
          diagnosticTools = []
          return
        }
        if (options.config?.failOnStartupError === true) {
          assert.equal(this.options.config.reconnect.enabled, false)
        }
        diagnosticTools = [{
          name: 'mcp__external__probe_fixture',
          description: 'Temporary diagnostic fixture',
          parameters: { type: 'object' },
        }]
        this.fiber = { uid: 1, state: 2 }
      },
    }
    ctx.provide('loader', { entries: () => [fakeEntry] })
    const manager = new McpManagerService(ctx)
    const beforeExternalEdit = await manager.invoke('list', {})
    assert.equal(beforeExternalEdit.profile.key, 'external-edit')
    assert.equal(beforeExternalEdit.servers[0]?.name, 'Before external edit')
    assert.equal(beforeExternalEdit.servers.length, 2)
    assert.equal(toolSchemaReads, 2, 'each manager projection must reuse one tool-registry snapshot across servers')

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

    await externalPatchStore.write([{
      ...server,
      name: 'After external edit',
      command: process.execPath,
      args: ['probe-fixture.mjs'],
    }])
    await manager.invoke('list', {})

    const setRecord = { id: 'external-set', name: 'Externally edited Set', serverIds: ['external'] }
    const disabledAtStartup = await manager.invoke('upsertSet', { set: setRecord, active: false })
    assert.deepEqual(disabledAtStartup.activeSetIds, [])
    assert.equal(disabledAtStartup.servers.find((item) => item.id === 'external')?.enabled, false)
    fakeEntry.options = toLoaderEntry({
      ...server,
      name: 'After external edit',
      command: process.execPath,
      args: ['probe-fixture.mjs'],
      enabled: false,
    })
    const inactiveDoctor = await manager.doctor('external')
    assert.equal(inactiveDoctor.state, 'pass')
    assert.equal(inactiveDoctor.checks.find((check) => check.id === 'loader')?.state, 'pass')
    const inactiveRuntime = inactiveDoctor.checks.find((check) => check.id === 'runtime')
    const inactiveTools = inactiveDoctor.checks.find((check) => check.id === 'tools')
    assert.equal(inactiveRuntime?.state, 'pass')
    assert.equal(inactiveRuntime?.detail, 'reachable')
    assert.deepEqual(inactiveTools, {
      id: 'tools',
      state: 'pass',
      detail: '1 tool(s) discovered during temporary activation',
    })
    assert.equal(loaderUpdates.length, 2)
    assert.equal(loaderUpdates[0]?.disabled, null)
    assert.equal(loaderUpdates[0]?.config.failOnStartupError, true)
    assert.equal(loaderUpdates[0]?.config.reconnect.enabled, false)
    assert.equal(loaderUpdates[1]?.disabled, true)
    assert.equal(fakeEntry.options.disabled, true)
    assert.equal(fakeEntry.fiber, undefined)
    assert.deepEqual(diagnosticTools, [])
    const enabledAtStartup = await manager.invoke('upsertSet', { set: setRecord, active: true })
    assert.deepEqual(enabledAtStartup.activeSetIds, ['external-set'])
    assert.equal(enabledAtStartup.servers.find((item) => item.id === 'external')?.enabled, true)
    const enabledServer = {
      ...server,
      name: 'After external edit',
      command: process.execPath,
      args: ['probe-fixture.mjs'],
      enabled: true,
    }
    fakeEntry.options = toLoaderEntry(enabledServer)
    fakeEntry.fiber = { uid: 2, state: 2 }
    diagnosticTools = [{
      name: 'mcp__external__probe_fixture',
      description: 'Runtime fixture',
      parameters: { type: 'object' },
    }]
    const connected = await manager.invoke('list', {})
    assert.equal(connected.servers.find((item) => item.id === 'external')?.state, 'connected')
    const patchBeforeStop = await readFile(patchPath, 'utf8')
    const setsPath = join(profileDir, 'mcp-manager.sets.yml')
    const setsBeforeStop = await readFile(setsPath, 'utf8')
    const updatesBeforeStop = loaderUpdates.length
    const stopped = await manager.invoke('stop', { id: 'external' })
    const stoppedServer = stopped.servers.find((item) => item.id === 'external')
    assert.equal(stoppedServer?.enabled, true)
    assert.equal(stoppedServer?.state, 'stopped')
    assert.deepEqual(stopped.activeSetIds, ['external-set'])
    assert.deepEqual(stopped.sets[0]?.serverIds, ['external'])
    assert.equal(fakeEntry.options.disabled, true)
    assert.equal(fakeEntry.fiber, undefined)
    assert.deepEqual(diagnosticTools, [])
    assert.equal((await manager.invoke('list', {})).servers.find((item) => item.id === 'external')?.state, 'stopped')
    assert.equal(await readFile(patchPath, 'utf8'), patchBeforeStop)
    assert.equal(await readFile(setsPath, 'utf8'), setsBeforeStop)
    const resumed = await manager.invoke('resume', { id: 'external' })
    assert.equal(resumed.servers.find((item) => item.id === 'external')?.state, 'connected')
    assert.equal(resumed.servers.find((item) => item.id === 'external')?.tools.length, 1)
    assert.equal(Boolean(fakeEntry.options.disabled), false)
    assert.equal(loaderUpdates[updatesBeforeStop]?.disabled, true)
    assert.equal(loaderUpdates[updatesBeforeStop + 1]?.disabled, null)
    assert.equal(await readFile(patchPath, 'utf8'), patchBeforeStop)
    assert.equal(await readFile(setsPath, 'utf8'), setsBeforeStop)
    await assert.rejects(
      manager.invoke('upsertSet', { set: setRecord, active: 'yes' }),
      /active must be a boolean/,
    )
  } finally {
    if (previousDshHome === undefined) delete process.env.DSH_HOME
    else process.env.DSH_HOME = previousDshHome
  }
} finally {
  await rm(temp, { recursive: true, force: true })
}

console.log('verified package lifecycle, manifest, Cordis entry contract, Set union, and external profile refresh')

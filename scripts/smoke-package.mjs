import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { access, mkdir, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import * as yaml from 'js-yaml'

const root = dirname(fileURLToPath(new URL('../package.json', import.meta.url)))
const temp = await mkdtemp(join(root, '.package-smoke-'))

function run(command, args, cwd) {
  const result = spawnSync(command, args, {
    cwd,
    encoding: 'utf8',
    maxBuffer: 10 * 1024 * 1024,
  })
  assert.equal(result.error, undefined, result.error?.message)
  assert.equal(
    result.status,
    0,
    [result.stdout, result.stderr].filter(Boolean).join('\n'),
  )
  return result.stdout
}

function packageRecords(output) {
  const parsed = JSON.parse(output)
  return Array.isArray(parsed) ? parsed : Object.values(parsed)
}

function exportTargets(value) {
  if (typeof value === 'string') return [value]
  if (!value || typeof value !== 'object') return []
  return Object.values(value).flatMap(exportTargets)
}

try {
  const packDir = join(temp, 'pack')
  const consumerDir = join(temp, 'consumer')
  await mkdir(packDir)
  await mkdir(consumerDir)

  const sourcePackage = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'))

  const packOutput = run('npm', [
    'pack',
    '--json',
    '--ignore-scripts',
    '--pack-destination',
    packDir,
    '--cache',
    join(root, '.npm-cache'),
  ], root)
  const records = packageRecords(packOutput)
  assert.equal(records.length, 1, 'npm pack must produce exactly one tarball')
  const [record] = records
  const tarball = join(packDir, record.filename)
  const packedFiles = new Set(record.files.map((file) => file.path))

  await writeFile(join(consumerDir, 'package.json'), `${JSON.stringify({
    name: 'dsh-tui-mcp-manager-package-smoke',
    private: true,
    dependencies: {
      [sourcePackage.name]: `file:${tarball}`,
    },
  }, null, 2)}\n`)
  await writeFile(join(consumerDir, 'pnpm-workspace.yaml'), [
    'packages:',
    '  - .',
    '',
    'autoInstallPeers: false',
    '',
  ].join('\n'))

  const modules = yaml.load(await readFile(join(root, 'node_modules', '.modules.yaml'), 'utf8'))
  assert.equal(typeof modules?.storeDir, 'string', 'pnpm storeDir is missing from node_modules/.modules.yaml')
  run('pnpm', [
    'install',
    '--offline',
    '--ignore-scripts',
    '--store-dir',
    dirname(modules.storeDir),
  ], consumerDir)

  const installedDir = join(consumerDir, 'node_modules', sourcePackage.name)
  const installedRealDir = await realpath(installedDir)
  const installedPackage = JSON.parse(await readFile(join(installedDir, 'package.json'), 'utf8'))
  const manifest = JSON.parse(await readFile(join(installedDir, 'dsh-plugin.json'), 'utf8'))

  assert.equal(installedPackage.scripts.prepare, undefined)
  assert.equal(installedPackage.main, sourcePackage.main)
  assert.equal(manifest.facets.host.entry, sourcePackage.main.replace(/^\.\//u, ''))

  const requiredFiles = new Set([
    'package.json',
    'README.md',
    'README_EN.md',
    'LICENSE',
    'docs/images/mcp-manager-sets.png',
    'docs/images/mcp-manager-servers.png',
    'docs/images/mcp-manager-tools.png',
    'docs/images/mcp-manager-set-editor.png',
    'docs/images/mcp-manager-server-editor.png',
    sourcePackage.main,
    sourcePackage.types,
    sourcePackage.dsh.bundle.patch,
    './dsh-plugin.json',
    `./${manifest.facets.host.entry}`,
    ...manifest.overrides.map((entry) => `./${entry.target}`),
    ...exportTargets(sourcePackage.exports),
  ].map((path) => path.replace(/^\.\//u, '')))

  for (const path of requiredFiles) {
    assert.ok(packedFiles.has(path), `${path} is missing from npm pack output`)
    await access(join(installedDir, path))
  }

  const bundlePatch = yaml.load(await readFile(join(installedDir, sourcePackage.dsh.bundle.patch), 'utf8'))
  assert.ok(Array.isArray(bundlePatch))
  assert.equal(bundlePatch[0]?.insert?.[0]?.name, sourcePackage.name)

  const importResult = JSON.parse(run(process.execPath, [
    '--input-type=module',
    '--eval',
    [
      `const root = await import(${JSON.stringify(sourcePackage.name)})`,
      `const server = await import(${JSON.stringify(`${sourcePackage.name}/server`)})`,
      `const rootEntry = import.meta.resolve(${JSON.stringify(sourcePackage.name)})`,
      `const serverEntry = import.meta.resolve(${JSON.stringify(`${sourcePackage.name}/server`)})`,
      `const patchEntry = import.meta.resolve(${JSON.stringify(`${sourcePackage.name}/cordis.patch.yml`)})`,
      `const manifestEntry = import.meta.resolve(${JSON.stringify(`${sourcePackage.name}/dsh-plugin.json`)})`,
      'console.log(JSON.stringify({',
      '  rootEntry, serverEntry, patchEntry, manifestEntry,',
      '  rootName: root.name, rootApply: typeof root.apply, rootConfig: typeof root.Config,',
      '  serverName: server.name, serverApply: typeof server.apply,',
      '}))',
    ].join('\n'),
  ], consumerDir).trim())

  const rootEntry = fileURLToPath(importResult.rootEntry)
  const serverEntry = fileURLToPath(importResult.serverEntry)
  assert.equal(relative(installedRealDir, rootEntry), sourcePackage.main.replace(/^\.\//u, ''))
  assert.equal(relative(installedRealDir, serverEntry), sourcePackage.exports['./server'].import.replace(/^\.\//u, ''))
  assert.equal(fileURLToPath(importResult.patchEntry), join(installedRealDir, 'cordis.patch.yml'))
  assert.equal(fileURLToPath(importResult.manifestEntry), join(installedRealDir, 'dsh-plugin.json'))
  assert.equal(importResult.rootName, sourcePackage.name)
  assert.equal(importResult.rootApply, 'function')
  assert.equal(importResult.rootConfig, 'function')
  assert.equal(importResult.serverName, 'dsh-tui-mcp-manager-server')
  assert.equal(importResult.serverApply, 'function')

  console.log(`smoke-tested ${record.filename}: installed files, screenshots, bundle patch, root entry, and server entry`)
} finally {
  await rm(temp, { recursive: true, force: true })
}

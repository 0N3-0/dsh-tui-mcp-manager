import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

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

const entry = await readFile(new URL('../lib/types/index.js', import.meta.url), 'utf8')
assert.match(entry, /const name = ['"]dsh-tui-mcp-manager['"]/)
assert.match(entry, /export const Config\s*=/)
assert.match(entry, /export function apply\s*\(/)
assert.doesNotMatch(entry, /export default/)

console.log('verified manifest and Cordis entry contract')

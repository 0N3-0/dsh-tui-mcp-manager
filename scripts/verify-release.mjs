import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const rootUrl = new URL('../', import.meta.url)
const packageJson = JSON.parse(await readFile(new URL('package.json', rootUrl), 'utf8'))
const manifest = JSON.parse(await readFile(new URL('dsh-plugin.json', rootUrl), 'utf8'))
const releaseTag = process.argv[2] || process.env.GITHUB_REF_NAME

assert.ok(releaseTag, 'Release tag is required')
assert.equal(
  releaseTag,
  `v${packageJson.version}`,
  `Release tag ${releaseTag} does not match package version ${packageJson.version}`,
)
assert.equal(
  manifest.version,
  packageJson.version,
  `dsh-plugin.json version ${manifest.version} does not match package version ${packageJson.version}`,
)
assert.notEqual(packageJson.private, true, 'package.json must not be private')
assert.equal(packageJson.publishConfig?.access, 'public', 'publishConfig.access must be public')
assert.equal(
  packageJson.repository?.url,
  'git+https://github.com/0N3-0/dsh-tui-mcp-manager.git',
  'repository.url must match the Trusted Publisher repository',
)

console.log(`Release metadata verified for ${packageJson.name}@${packageJson.version}`)

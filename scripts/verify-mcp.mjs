import assert from 'node:assert/strict'
import { fileURLToPath } from 'node:url'
import { apply } from '../lib/types/server/index.js'

const fixture = fileURLToPath(new URL('./fixtures/mcp-capabilities.mjs', import.meta.url))
const registeredTools = new Map()
const resources = new Map()
const promptSections = new Map()
const effects = []
const diagnostics = []
const logger = {
  warn: (message) => diagnostics.push(String(message)),
  error: (message) => diagnostics.push(String(message)),
}
const context = {
  root: undefined,
  fiber: { uid: 1 },
  logger,
  tools: {
    register(definition) {
      registeredTools.set(definition.name, definition)
      return () => registeredTools.delete(definition.name)
    },
  },
  credentials: {
    async resolve() { return { value: 'integration-secret' } },
  },
  mcpResources: {
    register(serverName, provider) {
      resources.set(serverName, provider)
      return () => resources.delete(serverName)
    },
  },
  systemPrompt: {
    getSectionOrder() { return 50 },
    section(definition) {
      promptSections.set(definition.name, definition)
      return () => promptSections.delete(definition.name)
    },
  },
  effect(register) {
    const cleanup = register()
    if (cleanup) effects.push(cleanup)
  },
  inject(_names, register) { register(context) },
  on() {},
  plugin(plugin, config) {
    const childEffects = []
    const child = {
      ...context,
      fiber: { uid: 2 },
      effect(register) {
        const cleanup = register()
        if (cleanup) childEffects.push(cleanup)
      },
      inject(_names, register) { register(child) },
    }
    const started = plugin.apply(child, config)
    return {
      then: (resolve, reject) => started.then(resolve, reject),
      async dispose() { for (const cleanup of childEffects.reverse()) await cleanup() },
    }
  },
}
context.root = context

try {
  await apply(context, {
    transport: 'stdio',
    serverName: 'fixture',
    command: process.execPath,
    args: [fixture],
    cwd: '',
    env: {},
    secretEnv: { MCP_TEST_PASSWORD: 'MCP_TEST_PASSWORD' },
    toolCallTimeoutMs: 5_000,
    maxInstructionBytes: 8_192,
    failOnStartupError: true,
    reconnect: { enabled: false },
  })

  assert.ok(registeredTools.has('mcp__fixture__credential_probe'))
  const execution = { signal: new AbortController().signal }
  const toolResult = await registeredTools.get('mcp__fixture__credential_probe').execute({}, execution)
  assert.match(JSON.stringify(toolResult), /credential received/)
  const provider = resources.get('fixture')
  assert.ok(provider, 'the credential adapter must publish the upstream MCP resource provider')
  const listed = await provider.request({ method: 'resources/list' }, execution)
  assert.match(JSON.stringify(listed), /sample:\/\/document/)
  const read = await provider.request({ method: 'resources/read', uri: 'sample://document' }, execution)
  assert.match(JSON.stringify(read), /resource bridge works/)
  const instructions = promptSections.get('mcp:fixture')?.text()
  assert.match(instructions, /sample resource/)
  assert.deepEqual(diagnostics, [])
} finally {
  for (const cleanup of effects.reverse()) await cleanup()
}
console.log('verified credential adapter, MCP tool, resource, and server instructions')

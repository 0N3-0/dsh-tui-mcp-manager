import { McpServer } from '@modelcontextprotocol/server'
import { StdioServerTransport } from '@modelcontextprotocol/server/stdio'

const server = new McpServer(
  { name: 'mcp-manager-capabilities', version: '1.0.0' },
  {
    capabilities: { tools: {}, resources: {} },
    instructions: 'Use the sample resource when asked for a sample document.',
  },
)
server.registerTool('credential_probe', { description: 'Report whether the test credential reached this server.' }, async () => ({
  content: [{ type: 'text', text: process.env.MCP_TEST_PASSWORD === 'integration-secret' ? 'credential received' : 'credential missing' }],
}))
server.registerResource('sample', 'sample://document', { title: 'Sample document', mimeType: 'text/plain' }, async (uri) => ({
  contents: [{ uri: uri.href, text: 'resource bridge works' }],
}))
await server.connect(new StdioServerTransport())

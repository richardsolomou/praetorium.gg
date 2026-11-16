import { afterEach, expect, it, vi } from 'vitest'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { PostHog } from 'posthog-node'
import { TOOL_ERROR_TYPE_META, TOOL_OUTCOME_META } from '../contracts/agentTools'
import { instrumentReferenceMcp, privateMcpEvent, userAgentClient } from './mcpAnalytics'

const tools = new Set(['search_reference'])

afterEach(() => vi.unstubAllEnvs())

const event = (name: string) => ({
  event: name,
  distinct_id: 'anonymous-session',
  timestamp: '2026-09-29T00:00:00Z',
  type: 'capture' as const,
  properties: {
    $mcp_source: 'posthog_mcp_analytics',
    $mcp_tool_name: 'search_reference',
    $mcp_duration_ms: 12,
    $mcp_is_error: false,
    $mcp_client_name: 'claude-ai',
    $mcp_llm_model: 'claude-opus-5-5',
    $mcp_input_keys: ['query'],
    $mcp_parameters: { query: 'private rules query' },
    $mcp_response: { text: 'private result' },
    $mcp_intent: 'private player question',
    $mcp_client_user_agent: 'private agent data',
    $ip: '192.0.2.1',
  },
})

it('keeps bounded MCP usage data without request or result content', () => {
  expect(privateMcpEvent(event('$mcp_tool_call'), tools)?.properties).toEqual({
    $mcp_source: 'posthog_mcp_analytics',
    $mcp_tool_name: 'search_reference',
    $mcp_duration_ms: 12,
    $mcp_is_error: false,
    $mcp_client_name: 'claude-ai',
    $mcp_llm_model: 'claude-opus-5-5',
    $mcp_input_keys: ['query'],
    $ip: null,
  })
})

it('keeps the bounded counts a result declares as its outcome', () => {
  const found = event('$mcp_tool_call')
  const response = { _meta: { [TOOL_OUTCOME_META]: { results: 0, filtered: true, query: 'private', 'Not a key': 1 } } }
  const properties = privateMcpEvent({ ...found, properties: { ...found.properties, $mcp_response: response } }, tools)?.properties ?? {}
  expect(Object.entries(properties).filter(([key]) => key.startsWith('outcome_'))).toEqual([
    ['outcome_results', 0],
    ['outcome_filtered', true],
  ])
})

it('drops non-MCP events', () => {
  expect(privateMcpEvent(event('$exception'), tools)).toBeNull()
})

it('reports a failure no tool declared as internal rather than the error class', () => {
  const failure = event('$mcp_tool_call')
  Object.assign(failure.properties, { $mcp_is_error: true, $mcp_error_type: 'TypeError', $mcp_error_message: 'x is undefined' })
  expect(privateMcpEvent(failure, tools)?.properties.$mcp_error_type).toBe('internal')
})

it('names the client by the first product token of its User-Agent', () => {
  expect(userAgentClient('claude-user/1.0 (+https://www.anthropic.com)')).toEqual({ name: 'claude-user', version: '1.0' })
})

it('records a signed-in caller as the account the web app identifies', async () => {
  vi.stubEnv('NODE_ENV', 'production')
  vi.stubEnv('VITE_POSTHOG_PROJECT_TOKEN', 'phc_test')
  vi.stubEnv('VITE_POSTHOG_HOST', 'https://us.i.posthog.com')
  const capture = vi.spyOn(PostHog.prototype, 'capture').mockImplementation(() => undefined)
  try {
    const server = new McpServer({ name: 'test', version: '1.0.0' })
    server.registerTool('search_reference', { description: 'Search.' }, async () => ({ content: [] }))
    instrumentReferenceMcp(server, tools, 'account-1')
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair()
    await server.connect(serverTransport)
    const client = new Client({ name: 'test-client', version: '1.0.0' })
    await client.connect(clientTransport)
    await client.callTool({ name: 'search_reference', arguments: {} })

    const call = capture.mock.calls.find(([input]) => input.event === '$mcp_tool_call')?.[0]
    expect([call?.distinctId, call?.properties?.$process_person_profile]).toEqual(['account-1', undefined])
  } finally {
    capture.mockRestore()
    vi.unstubAllEnvs()
  }
})

it('sends an exception without its message only for a failure no tool declared', async () => {
  vi.stubEnv('NODE_ENV', 'production')
  vi.stubEnv('VITE_POSTHOG_PROJECT_TOKEN', 'phc_test')
  vi.stubEnv('VITE_POSTHOG_HOST', 'https://us.i.posthog.com')
  const capture = vi.spyOn(PostHog.prototype, 'capture').mockImplementation(() => undefined)
  try {
    for (const tool of ['broken', 'missing']) {
      const server = new McpServer({ name: 'test', version: '1.0.0' })
      server.registerTool('broken', { description: 'Breaks.' }, async () => {
        throw new TypeError('boom')
      })
      server.registerTool('missing', { description: 'Finds nothing.' }, async () => ({
        content: [{ type: 'text', text: 'Not found.' }],
        isError: true,
        _meta: { [TOOL_ERROR_TYPE_META]: 'not_found' },
      }))
      instrumentReferenceMcp(server, new Set(['broken', 'missing']), null)
      const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair()
      await server.connect(serverTransport)
      const client = new Client({ name: 'test-client', version: '1.0.0' })
      await client.connect(clientTransport)
      await client.callTool({ name: tool, arguments: {} })
    }

    const exceptions = capture.mock.calls.flatMap(([input]) => (input.event === '$exception' ? [input.properties ?? {}] : []))
    expect(exceptions.map((properties) => [properties.$mcp_tool_name, JSON.stringify(properties.$exception_list)])).toEqual([
      ['broken', expect.not.stringContaining('boom')],
    ])
  } finally {
    capture.mockRestore()
    vi.unstubAllEnvs()
  }
})

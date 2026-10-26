import { afterEach, expect, it, vi } from 'vitest'
import { privateMcpEvent } from './mcpAnalytics'

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
    $ip: null,
  })
})

it('labels MCP usage with the deployment host', () => {
  vi.stubEnv('APP_URL', 'https://pr-722.praetorium.gg')
  expect(privateMcpEvent(event('$mcp_tool_call'), tools)?.properties.$host).toBe('pr-722.praetorium.gg')
})

it('drops non-MCP events', () => {
  expect(privateMcpEvent(event('$exception'), tools)).toBeNull()
})

it('reports a failure no tool declared as internal rather than the error class', () => {
  const failure = event('$mcp_tool_call')
  Object.assign(failure.properties, { $mcp_is_error: true, $mcp_error_type: 'TypeError', $mcp_error_message: 'x is undefined' })
  expect(privateMcpEvent(failure, tools)?.properties.$mcp_error_type).toBe('internal')
})

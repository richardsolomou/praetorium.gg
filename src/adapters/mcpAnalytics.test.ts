import { expect, it } from 'vitest'
import { privateMcpEvent } from './mcpAnalytics'

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
  },
})

it('keeps bounded MCP usage data without request or result content', () => {
  expect(privateMcpEvent(event('$mcp_tool_call'))?.properties).toEqual({
    $mcp_source: 'posthog_mcp_analytics',
    $mcp_tool_name: 'search_reference',
    $mcp_duration_ms: 12,
    $mcp_is_error: false,
  })
})

it('drops non-MCP events', () => {
  expect(privateMcpEvent(event('$exception'))).toBeNull()
})

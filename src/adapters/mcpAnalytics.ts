import { instrument, type BeforeSendFn } from '@posthog/mcp'
import { PostHog } from 'posthog-node'
import { postHogEnvironment } from 'ras-stack/posthog'
import { installPostHogServerTelemetryShutdown } from 'ras-stack/posthog/server'
import { globalSingleton } from 'ras-stack/server'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { TOOL_ERROR_TYPE_META, TOOL_ERROR_TYPES, type ToolErrorType } from '../contracts/agentTools'
import { deploymentHost } from './posthog'

const EVENT_PROPERTIES = [
  '$mcp_source',
  '$session_id',
  '$process_person_profile',
  '$mcp_server_name',
  '$mcp_server_version',
  '$mcp_protocol_version',
  '$mcp_tool_name',
  '$mcp_listed_tool_names',
  '$mcp_duration_ms',
  '$mcp_is_error',
  '$mcp_error_type',
] as const

type McpEvent = Parameters<BeforeSendFn>[0]

/**
 * Bounded MCP usage without request or result content. A call to a tool the server never registered,
 * such as a directory's health probe, is not a tool failure and is dropped.
 */
export function privateMcpEvent(event: McpEvent, toolNames: ReadonlySet<string>) {
  if (!event.event.startsWith('$mcp_')) return null
  const tool = event.properties.$mcp_tool_name
  if (event.event === '$mcp_tool_call' && !(typeof tool === 'string' && toolNames.has(tool))) return null
  const host = deploymentHost()
  event.properties = {
    ...Object.fromEntries(EVENT_PROPERTIES.flatMap((key) => (key in event.properties ? [[key, event.properties[key]]] : []))),
    ...(event.properties.$mcp_is_error === true ? { $mcp_error_type: errorType(event.properties) } : {}),
    ...(host ? { $host: host } : {}),
    $ip: null,
  }
  return event
}

const MCP_INVALID_ARGUMENTS = /^MCP error -32602: (?:Input validation error|Invalid arguments)/

/**
 * The failure category a tool result declares; otherwise the MCP SDK rejected the arguments before
 * the tool ran, or something failed that no tool anticipated. Never the thrown error's class name.
 */
function errorType(properties: McpEvent['properties']): ToolErrorType {
  const response: unknown = properties.$mcp_response
  const declared =
    response && typeof response === 'object' && '_meta' in response && response._meta && typeof response._meta === 'object'
      ? (response._meta as Record<string, unknown>)[TOOL_ERROR_TYPE_META]
      : undefined
  if (TOOL_ERROR_TYPES.some((type) => type === declared)) return declared as ToolErrorType
  const message = properties.$mcp_error_message
  return typeof message === 'string' && MCP_INVALID_ARGUMENTS.test(message) ? 'validation' : 'internal'
}

function mcpClient() {
  if (process.env.NODE_ENV !== 'production') return undefined
  return globalSingleton('praetorium.mcp-analytics', () => {
    const environment = postHogEnvironment({
      projectToken: process.env.VITE_POSTHOG_PROJECT_TOKEN,
      host: process.env.VITE_POSTHOG_HOST,
    })
    if (!environment) return undefined
    const client = new PostHog(environment.projectToken, { host: environment.host })
    installPostHogServerTelemetryShutdown({ shutdown: () => client.shutdown() })
    return client
  })
}

export function instrumentReferenceMcp(server: McpServer, toolNames: ReadonlySet<string>) {
  const client = mcpClient()
  if (!client) return
  instrument(server, client, {
    context: false,
    captureModel: false,
    enableConversationId: false,
    enableExceptionAutocapture: false,
    beforeSend: (event) => privateMcpEvent(event, toolNames),
  })
}

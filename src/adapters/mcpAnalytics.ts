import { instrument, type BeforeSendFn } from '@posthog/mcp'
import { PostHog } from 'posthog-node'
import { postHogEnvironment } from 'ras-stack/posthog'
import { installPostHogServerTelemetryShutdown } from 'ras-stack/posthog/server'
import { globalSingleton } from 'ras-stack/server'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
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

export function privateMcpEvent(event: Parameters<BeforeSendFn>[0]) {
  if (!event.event.startsWith('$mcp_')) return null
  const host = deploymentHost()
  event.properties = {
    ...Object.fromEntries(EVENT_PROPERTIES.flatMap((key) => (key in event.properties ? [[key, event.properties[key]]] : []))),
    ...(host ? { $host: host } : {}),
    $ip: null,
  }
  return event
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

export function instrumentReferenceMcp(server: McpServer) {
  const client = mcpClient()
  if (!client) return
  instrument(server, client, {
    context: false,
    captureModel: false,
    enableConversationId: false,
    enableExceptionAutocapture: false,
    beforeSend: privateMcpEvent,
  })
}

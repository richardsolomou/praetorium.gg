import { getRequestHeaders, instrument, type BeforeSendFn } from '@posthog/mcp'
import { PostHog } from 'posthog-node'
import packageJson from '../../package.json' with { type: 'json' }
import { hostVariable, postHogEnvironment, projectTokenVariable } from '../contracts/posthog'
import { globalSingleton } from '../lib/globalSingleton'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { TOOL_ERROR_TYPE_META, TOOL_ERROR_TYPES, TOOL_OUTCOME_META, type ToolErrorType } from '../contracts/agentTools'
import { deploymentHost, serverEventContext } from './posthog'

const EVENT_PROPERTIES = [
  '$mcp_source',
  '$session_id',
  '$process_person_profile',
  '$mcp_server_name',
  '$mcp_server_version',
  '$mcp_protocol_version',
  '$mcp_server_build',
  '$mcp_client_name',
  '$mcp_client_version',
  '$mcp_vendor_client',
  '$mcp_llm_model',
  '$mcp_llm_model_source',
  '$mcp_conversation_id',
  '$mcp_tool_name',
  '$mcp_tool_category',
  '$mcp_tool_description',
  '$mcp_listed_tool_names',
  '$mcp_input_keys',
  '$mcp_duration_ms',
  '$mcp_is_error',
  '$mcp_error_type',
  '$mcp_error_status',
] as const

const EXCEPTION_PROPERTIES = [
  '$session_id',
  '$process_person_profile',
  '$mcp_server_build',
  '$mcp_client_name',
  '$mcp_conversation_id',
  '$mcp_tool_name',
  '$mcp_tool_category',
] as const

const OUTCOME_KEY = /^[a-z_]{1,40}$/

type McpEvent = Parameters<BeforeSendFn>[0]
type McpProperties = McpEvent['properties']

/**
 * Bounded MCP usage without request or result content: argument names but not their values, and the counts a
 * result declares as its outcome. A call to a tool the server never registered, such as a directory's health
 * probe, is not a tool failure and is dropped.
 */
export function privateMcpEvent(event: McpEvent, toolNames: ReadonlySet<string>) {
  if (!event.event.startsWith('$mcp_')) return null
  const tool = event.properties.$mcp_tool_name
  if (event.event === '$mcp_tool_call' && !(typeof tool === 'string' && toolNames.has(tool))) return null
  event.properties = {
    ...picked(event.properties, EVENT_PROPERTIES),
    ...(event.properties.$mcp_is_error === true ? { $mcp_error_type: errorType(event.properties) } : {}),
    ...outcome(event.properties),
    $ip: null,
  }
  return event
}

/** An exception for a failure no tool declared, located by its class, stack, tool and build, never its message. */
export function privateMcpException(event: McpEvent) {
  const list: unknown = event.properties.$exception_list
  event.properties = {
    $exception_list: Array.isArray(list) ? list.map(withoutMessage) : [],
    ...picked(event.properties, EXCEPTION_PROPERTIES),
    $ip: null,
  }
  return event
}

const withoutMessage = (exception: unknown) => (exception && typeof exception === 'object' ? { ...exception, value: undefined } : exception)

const picked = (properties: McpProperties, keys: readonly string[]) =>
  Object.fromEntries(keys.flatMap((key) => (key in properties ? [[key, properties[key]]] : [])))

function resultMeta(properties: McpProperties) {
  const response: unknown = properties.$mcp_response
  return response && typeof response === 'object' && '_meta' in response && response._meta && typeof response._meta === 'object'
    ? (response._meta as Record<string, unknown>)
    : undefined
}

function outcome(properties: McpProperties) {
  const declared = resultMeta(properties)?.[TOOL_OUTCOME_META]
  if (!declared || typeof declared !== 'object') return {}
  return Object.fromEntries(
    Object.entries(declared).flatMap(([key, value]) =>
      OUTCOME_KEY.test(key) && (typeof value === 'boolean' || (typeof value === 'number' && Number.isFinite(value)))
        ? [[`outcome_${key}`, value]]
        : [],
    ),
  )
}

const MCP_INVALID_ARGUMENTS = /^MCP error -32602: (?:Input validation error|Invalid arguments)/

const declaredErrorType = (properties: McpProperties) => {
  const declared = resultMeta(properties)?.[TOOL_ERROR_TYPE_META]
  return TOOL_ERROR_TYPES.find((type) => type === declared)
}

/**
 * The failure category a tool result declares; otherwise the MCP SDK rejected the arguments before
 * the tool ran, or something failed that no tool anticipated. Never the thrown error's class name.
 */
function errorType(properties: McpProperties): ToolErrorType {
  const declared = declaredErrorType(properties)
  if (declared) return declared
  const message = properties.$mcp_error_message
  return typeof message === 'string' && MCP_INVALID_ARGUMENTS.test(message) ? 'validation' : 'internal'
}

/** A failure only a code fix resolves, which is worth an exception; declared refusals and bad arguments are not. */
const unexpectedFailure = (event: McpEvent) =>
  event.event === '$mcp_tool_call' &&
  event.properties.$mcp_is_error === true &&
  errorType(event.properties) === 'internal' &&
  !declaredErrorType(event.properties)

export const MCP_ANALYTICS = 'praetorium.mcp-analytics'

function mcpClient() {
  if (process.env.NODE_ENV !== 'production') return undefined
  // The Nitro plugin in `src/server/shutdown.ts` shuts this client down once the server has drained.
  return globalSingleton(MCP_ANALYTICS, () => {
    const environment = postHogEnvironment({ projectToken: process.env[projectTokenVariable], host: process.env[hostVariable] })
    if (!environment) return undefined
    return new PostHog(environment.projectToken, { host: environment.host, beforeSend: serverEventContext(deploymentHost()) })
  })
}

const USER_AGENT_PRODUCT = /^([\w.-]{1,64})(?:\/([\w.+-]{1,32}))?/
const CLIENT_INFO_META = 'io.modelcontextprotocol/clientInfo'

/** The first product token of a User-Agent, such as `claude-user/1.0`. */
export function userAgentClient(userAgent: string | undefined) {
  const match = userAgent ? USER_AGENT_PRODUCT.exec(userAgent) : null
  return match ? { name: match[1], version: match[2] } : null
}

/** A signed-in caller is the same person the web app identifies, so MCP use joins their product analytics. */
export function instrumentReferenceMcp(server: McpServer, toolNames: ReadonlySet<string>, userId: string | null) {
  const client = mcpClient()
  if (!client) return
  let unexpected = false
  instrument(server, client, {
    context: false,
    identify: userId ? { distinctId: userId } : null,
    // A stateless server never sees `initialize` on the instance answering a call, so a client that does not name itself in the request's `_meta` is named by its User-Agent.
    clientInfo: (request, extra) =>
      request.method === 'initialize' || request.params?._meta?.[CLIENT_INFO_META]
        ? null
        : userAgentClient([getRequestHeaders(extra)?.['user-agent']].flat()[0]),
    serverBuild: packageJson.version,
    // Each request builds its own server, so this holds the one call it answers; the SDK sends a failed call before its exception.
    beforeSend: (event) => {
      if (event.event === '$exception') return unexpected ? privateMcpException(event) : null
      if (event.event === '$mcp_tool_call') unexpected = unexpectedFailure(event)
      return privateMcpEvent(event, toolNames)
    },
  })
}

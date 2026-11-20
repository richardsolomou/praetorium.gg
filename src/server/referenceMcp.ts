import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js'
import { requireMcpAuth } from '@better-auth/mcp'
import { createInsufficientScopeError } from 'better-auth/oauth2'
import { instrumentReferenceMcp } from '../adapters/mcpAnalytics'
import { app } from './app'
import { referenceRateLimit } from './referenceApi'
import { PRAETORIUM_MCP_INSTRUCTIONS } from './referenceGuide'
import { ACCOUNT_MCP_SCOPES } from './accountMcp'
import { createAgentTools } from './createAgentTools'
import { boundedBody } from './boundedBody'
import { agentInputMaxBytes, AGENT_INPUT_MAX_BYTES } from '../contracts/agentTools'
import { publicOrigin } from './origins'
import { absoluteAgentText } from './agentLinks'
import {
  referenceResources,
  rulesQuestionPrompt,
  rulesQuestionText,
  missionMatchupPrompt,
  missionMatchupText,
  promptMessages,
} from './referenceAgentContext'
import { agentSkills } from './agentSkills'
import { MCP_ACCOUNT_SCOPES } from '../shared/mcpConsent'

const RPC_OVERHEAD_BYTES = 8 * 1024

export async function handleReferenceMcp(request: Request) {
  if (request.method !== 'POST') return referenceMcpResponse(mcpError(405, -32000, 'Method not allowed.', { Allow: 'POST' }))
  const limited = referenceRateLimit(request)
  if (limited) return referenceMcpResponse(limited)
  // Without a token an account tool answers with a tool error carrying the sign-in challenge, so the session keeps its
  // public tools; only a token that fails verification gets the transport 401.
  if (request.headers.has('authorization')) {
    const { auth } = app()
    const resource = auth.mcpResource
    const protectedHandler = requireMcpAuth(
      auth,
      async (verified, claims) => {
        if (typeof claims.sub !== 'string' || typeof claims.client_id !== 'string') return revokedMcpResponse(resource)
        const scopes = typeof claims.scope === 'string' ? claims.scope.split(/\s+/) : []
        const canImport = scopes.includes('mcp:manage') && (await auth.hasMcpConsent(claims.sub, claims.client_id, 'mcp:manage'))
        const body = await boundedMcpBody(
          verified,
          canImport ? agentInputMaxBytes('import_collection') + RPC_OVERHEAD_BYTES : AGENT_INPUT_MAX_BYTES,
        )
        if ('error' in body) return body.error
        const scope = body.tool && Object.hasOwn(ACCOUNT_MCP_SCOPES, body.tool) ? ACCOUNT_MCP_SCOPES[body.tool] : undefined
        if (scope && !scopes.includes(scope)) throw createInsufficientScopeError([scope])
        if (!(canImport && scope === 'mcp:manage') && !(await auth.hasMcpConsent(claims.sub, claims.client_id, scope)))
          return revokedMcpResponse(resource)
        return serveMcp(verified, body.parsed, claims.sub)
      },
      {
        resource,
        issuer: auth.issuer,
        // The keys are this server's own; through the public address a rolling deploy can route the fetch to a container that is not serving.
        jwksUrl: `http://127.0.0.1:${process.env.PORT ?? 3000}/api/auth/jwks`,
        challengeScopes: [...MCP_ACCOUNT_SCOPES],
      },
    )
    try {
      return referenceMcpResponse(await protectedHandler(request))
    } catch (error) {
      if (!(error instanceof Error) || !/jwks/i.test(`${error.name} ${error.message}`)) throw error
      return referenceMcpResponse(
        mcpError(503, -32000, 'Sign-in could not be checked just now. Try again shortly.', { 'Retry-After': '5' }),
      )
    }
  }
  const body = await boundedMcpBody(request, AGENT_INPUT_MAX_BYTES)
  return referenceMcpResponse('error' in body ? body.error : await serveMcp(request, body.parsed, null))
}

/** Where a client reads how to sign in to the MCP resource. */
function resourceMetadata(resource: string) {
  const url = new URL(resource)
  return `${url.origin}/.well-known/oauth-protected-resource${url.pathname}`
}

function revokedMcpResponse(resource: string) {
  return mcpError(401, -32000, 'MCP authorization is no longer active.', {
    'WWW-Authenticate': `Bearer resource_metadata="${resourceMetadata(resource)}", error="invalid_token"`,
  })
}

async function serveMcp(request: Request, parsed: unknown, userId: string | null) {
  const server = referenceMcpServer(userId, publicOrigin(request))
  const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true })
  try {
    await server.connect(transport)
    return await transport.handleRequest(request, { parsedBody: parsed })
  } finally {
    await server.close()
  }
}

async function boundedMcpBody(request: Request, limit: number): Promise<{ parsed: unknown; tool: string | null } | { error: Response }> {
  const bytes = await boundedBody(request, limit)
  const tooLarge = () => ({ error: mcpError(413, -32000, 'Request body is too large.') })
  if (bytes === null) return tooLarge()
  let parsed: unknown
  try {
    parsed = JSON.parse(bytes.toString('utf8'))
  } catch {
    return { error: mcpError(400, -32700, 'Parse error: Invalid JSON') }
  }
  if (Array.isArray(parsed)) return { error: mcpError(400, -32600, 'JSON-RPC batches are not supported.') }
  const call =
    parsed && typeof parsed === 'object' && 'method' in parsed && parsed.method === 'tools/call' && 'params' in parsed
      ? parsed.params
      : null
  const tool = call && typeof call === 'object' && 'name' in call && typeof call.name === 'string' ? call.name : null
  if (bytes.length > AGENT_INPUT_MAX_BYTES && tool !== 'import_collection') return tooLarge()
  return { parsed, tool }
}

function referenceMcpResponse(response: Response) {
  const headers = new Headers(response.headers)
  headers.set('Access-Control-Allow-Origin', '*')
  headers.set('Access-Control-Expose-Headers', 'WWW-Authenticate')
  headers.set('Cache-Control', 'no-store')
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers })
}

const mcpError = (status: number, code: number, message: string, headers?: HeadersInit) =>
  Response.json({ jsonrpc: '2.0', error: { code, message }, id: null }, { status, headers })

export function referenceMcpOptions() {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Headers': 'Content-Type, MCP-Protocol-Version, Authorization',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Expose-Headers': 'WWW-Authenticate',
      'Cache-Control': 'no-store',
    },
  })
}

function referenceMcpServer(userId: string | null, origin: string) {
  const server = new McpServer({ name: 'praetorium-reference', version: '1.5.0' }, { instructions: PRAETORIUM_MCP_INSTRUCTIONS })
  const tools = createAgentTools(userId)
  tools.registerMcp(server, origin, {
    scopes: ACCOUNT_MCP_SCOPES,
    challenge: `Bearer resource_metadata="${resourceMetadata(app().auth.mcpResource)}", error="insufficient_scope", error_description="Sign in to Praetorium to use this tool"`,
  })

  for (const resource of referenceResources) {
    const metadata = { title: resource.title, description: resource.description, mimeType: resource.mimeType }
    server.registerResource(resource.name, resource.uri, metadata, async (uri) => ({
      contents: [{ uri: uri.href, mimeType: resource.mimeType, text: absoluteAgentText(await resource.read(), origin) }],
    }))
  }
  server.registerPrompt(rulesQuestionPrompt.name, rulesQuestionPrompt, async (input) => promptMessages(rulesQuestionText(input)))
  server.registerPrompt(missionMatchupPrompt.name, missionMatchupPrompt, async (input) => promptMessages(missionMatchupText(input)))
  for (const skill of agentSkills)
    server.registerPrompt(skill.name, { title: skill.title, description: skill.description }, async () => promptMessages(skill.body))
  instrumentReferenceMcp(server, tools.names(), userId)
  return server
}

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js'
import { requireMcpAuth } from '@better-auth/mcp'
import { instrumentReferenceMcp } from '../adapters/mcpAnalytics'
import { app } from './app'
import { referenceRateLimit } from './referenceApi'
import { PRAETORIUM_MCP_INSTRUCTIONS } from './referenceGuide'
import { ACCOUNT_MCP_SCOPES } from './accountMcp'
import { createAgentTools } from './createAgentTools'
import { boundedText } from './boundedBody'
import { publicOrigin } from './requestOrigin'
import { absoluteAgentText } from './agentLinks'
import {
  referenceResources,
  rulesQuestionPrompt,
  rulesQuestionText,
  missionMatchupPrompt,
  missionMatchupText,
  promptMessages,
} from './referenceAgentContext'

const MCP_REQUEST_MAX_BYTES = 64 * 1024

export async function handleReferenceMcp(request: Request) {
  if (request.method !== 'POST') return referenceMcpResponse(methodNotAllowed())
  const limited = referenceRateLimit(request, 120)
  if (limited) return referenceMcpResponse(limited)
  const body = await boundedMcpBody(request)
  if ('error' in body) return referenceMcpResponse(body.error)
  const parsed = body.parsed
  const call =
    parsed && typeof parsed === 'object' && 'method' in parsed && parsed.method === 'tools/call' && 'params' in parsed
      ? parsed.params
      : null
  const name = call && typeof call === 'object' && 'name' in call && typeof call.name === 'string' ? call.name : null
  const scope = name && Object.hasOwn(ACCOUNT_MCP_SCOPES, name) ? ACCOUNT_MCP_SCOPES[name] : undefined
  if (scope || request.headers.has('authorization')) {
    const { auth } = app()
    const resource = auth.mcpResource
    const protectedHandler = requireMcpAuth(
      auth,
      async (verified, claims) => {
        if (
          typeof claims.sub !== 'string' ||
          typeof claims.client_id !== 'string' ||
          !(await auth.hasMcpConsent(claims.sub, claims.client_id, scope))
        )
          return revokedMcpResponse(resource)
        return serveMcp(verified, parsed, claims.sub)
      },
      {
        resource,
        issuer: auth.issuer,
        // The keys are this server's own; through the public address a rolling deploy can route the fetch to a container that is not serving.
        jwksUrl: `http://127.0.0.1:${process.env.PORT ?? 3000}/api/auth/jwks`,
        ...(scope ? { requiredScopes: [scope] } : {}),
        challengeScopes: ['mcp:read', 'mcp:write'],
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
  return referenceMcpResponse(await serveMcp(request, parsed, null))
}

function revokedMcpResponse(resource: string) {
  const url = new URL(resource)
  return mcpError(401, -32000, 'MCP authorization is no longer active.', {
    'WWW-Authenticate': `Bearer resource_metadata="${url.origin}/.well-known/oauth-protected-resource${url.pathname}", error="invalid_token"`,
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

async function boundedMcpBody(request: Request): Promise<{ parsed: unknown } | { error: Response }> {
  const text = await boundedText(request, MCP_REQUEST_MAX_BYTES)
  if (text === null) return { error: mcpError(413, -32000, 'Request body is too large.') }
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    return { error: mcpError(400, -32700, 'Parse error: Invalid JSON') }
  }
  return Array.isArray(parsed) ? { error: mcpError(400, -32600, 'JSON-RPC batches are not supported.') } : { parsed }
}

function referenceMcpResponse(response: Response) {
  const headers = new Headers(response.headers)
  headers.set('Access-Control-Allow-Origin', '*')
  headers.set('Access-Control-Expose-Headers', 'WWW-Authenticate')
  headers.set('Cache-Control', 'no-store')
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers })
}

const methodNotAllowed = () =>
  Response.json(
    { jsonrpc: '2.0', error: { code: -32000, message: 'Method not allowed.' }, id: null },
    { status: 405, headers: { Allow: 'POST' } },
  )

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
  const server = new McpServer({ name: 'praetorium-reference', version: '1.2.0' }, { instructions: PRAETORIUM_MCP_INSTRUCTIONS })
  const tools = createAgentTools(userId)
  tools.registerMcp(server, origin)

  for (const resource of referenceResources) {
    const metadata = { title: resource.title, description: resource.description, mimeType: resource.mimeType }
    server.registerResource(resource.name, resource.uri, metadata, async (uri) => ({
      contents: [{ uri: uri.href, mimeType: resource.mimeType, text: absoluteAgentText(await resource.read(), origin) }],
    }))
  }
  server.registerPrompt(rulesQuestionPrompt.name, rulesQuestionPrompt, async (input) => promptMessages(rulesQuestionText(input)))
  server.registerPrompt(missionMatchupPrompt.name, missionMatchupPrompt, async (input) => promptMessages(missionMatchupText(input)))
  instrumentReferenceMcp(server, tools.names())
  return server
}

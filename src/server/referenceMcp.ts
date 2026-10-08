import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js'
import { requireMcpAuth } from '@better-auth/mcp'
import { instrumentReferenceMcp } from '../adapters/mcpAnalytics'
import { app } from './app'
import { referenceRateLimit } from './referenceApi'
import { PRAETORIUM_MCP_INSTRUCTIONS } from './referenceGuide'
import { ACCOUNT_MCP_SCOPES } from './accountMcp'
import { createAgentTools } from './createAgentTools'
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
    const resource = new URL('/mcp', process.env.APP_URL).toString()
    const issuer = process.env.SPACETIME_ISSUER ?? new URL('/api/auth', process.env.APP_URL).toString()
    const protectedHandler = requireMcpAuth(
      app().auth,
      async (verified, claims) => {
        if (
          typeof claims.sub !== 'string' ||
          typeof claims.client_id !== 'string' ||
          !(await app().auth.hasMcpConsent(claims.sub, claims.client_id, scope))
        )
          return revokedMcpResponse(resource)
        return serveMcp(verified, parsed, claims.sub)
      },
      {
        resource,
        issuer,
        jwksUrl: new URL('/api/auth/jwks', process.env.APP_URL).toString(),
        ...(scope ? { requiredScopes: [scope] } : {}),
        challengeScopes: ['mcp:read', 'mcp:write'],
      },
    )
    return referenceMcpResponse(await protectedHandler(request))
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
  const server = referenceMcpServer(userId)
  const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true })
  try {
    await server.connect(transport)
    return await transport.handleRequest(request, { parsedBody: parsed })
  } finally {
    await server.close()
  }
}

async function boundedMcpBody(request: Request): Promise<{ parsed: unknown } | { error: Response }> {
  const contentLength = Number(request.headers.get('content-length') ?? 0)
  if (contentLength > MCP_REQUEST_MAX_BYTES) return { error: mcpError(413, -32000, 'Request body is too large.') }
  if (!request.body) return { error: mcpError(400, -32700, 'Parse error: Invalid JSON') }

  const bytes = new Uint8Array(MCP_REQUEST_MAX_BYTES)
  const reader = request.body.getReader()
  let length = 0
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    if (length + value.byteLength > MCP_REQUEST_MAX_BYTES) {
      await reader.cancel()
      return { error: mcpError(413, -32000, 'Request body is too large.') }
    }
    bytes.set(value, length)
    length += value.byteLength
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(new TextDecoder().decode(bytes.subarray(0, length)))
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

function referenceMcpServer(userId: string | null) {
  const server = new McpServer({ name: 'praetorium-reference', version: '1.2.0' }, { instructions: PRAETORIUM_MCP_INSTRUCTIONS })
  const tools = createAgentTools(userId)
  tools.registerMcp(server)

  for (const resource of referenceResources) {
    const metadata = { title: resource.title, description: resource.description, mimeType: resource.mimeType }
    server.registerResource(resource.name, resource.uri, metadata, async (uri) => ({
      contents: [{ uri: uri.href, mimeType: resource.mimeType, text: await resource.read() }],
    }))
  }
  server.registerPrompt(rulesQuestionPrompt.name, rulesQuestionPrompt, async (input) => promptMessages(rulesQuestionText(input)))
  server.registerPrompt(missionMatchupPrompt.name, missionMatchupPrompt, async (input) => promptMessages(missionMatchupText(input)))
  instrumentReferenceMcp(server)
  return server
}

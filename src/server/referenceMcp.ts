import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js'
import { z } from 'zod'
import { REFERENCE_KINDS } from '../contracts/reference'
import { activeReferenceCorpus, referenceRateLimit } from './referenceApi'
import { referenceDocumentMarkdown } from './referenceCorpus'
import { REFERENCE_RESULT_MAX, searchReference } from './referenceSearch'

export async function handleReferenceMcp(request: Request) {
  if (request.method !== 'POST') return referenceMcpResponse(methodNotAllowed())
  const limited = referenceRateLimit(request, 120)
  if (limited) return referenceMcpResponse(limited)
  const server = referenceMcpServer()
  const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true })
  try {
    await server.connect(transport)
    return referenceMcpResponse(await transport.handleRequest(request))
  } finally {
    await server.close()
  }
}

function referenceMcpResponse(response: Response) {
  const headers = new Headers(response.headers)
  headers.set('Access-Control-Allow-Origin', '*')
  headers.set('Cache-Control', 'no-store')
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers })
}

const methodNotAllowed = () =>
  Response.json(
    { jsonrpc: '2.0', error: { code: -32000, message: 'Method not allowed.' }, id: null },
    { status: 405, headers: { Allow: 'POST' } },
  )

export function referenceMcpOptions() {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Headers': 'Content-Type, MCP-Protocol-Version',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'no-store',
    },
  })
}

function referenceMcpServer() {
  const server = new McpServer({ name: 'praetorium-reference', version: '1.0.0' })
  server.registerTool(
    'search_reference',
    {
      title: 'Search the Praetorium game reference',
      description:
        'Searches the verified rules, detachment, and datasheet text used by Praetorium. Returns bounded excerpts with canonical URLs, source revisions, and attribution.',
      inputSchema: {
        query: z.string().trim().min(2).max(120).describe('Words, a printed rule number, an ability, a weapon, or a rules phrase.'),
        kinds: z.array(z.enum(REFERENCE_KINDS)).max(REFERENCE_KINDS.length).optional(),
        faction: z.string().trim().min(1).max(160).optional(),
        limit: z.number().int().min(1).max(REFERENCE_RESULT_MAX).default(10),
      },
    },
    async ({ query, kinds, faction, limit }) => {
      const corpus = activeReferenceCorpus()
      if (!corpus) return unavailable()
      const result = searchReference(corpus, { query, kinds, faction, limit })
      return { content: [{ type: 'text', text: JSON.stringify(result) }], structuredContent: result }
    },
  )
  server.registerTool(
    'get_reference',
    {
      title: 'Read one Praetorium reference result',
      description:
        'Reads the complete bounded document returned by search_reference, with its source location, revisions, and attribution.',
      inputSchema: { id: z.string().min(1).max(400).describe('The stable result id returned by search_reference.') },
    },
    async ({ id }) => {
      const corpus = activeReferenceCorpus()
      if (!corpus) return unavailable()
      const document = corpus.byId.get(id)
      if (!document) return { content: [{ type: 'text', text: 'Reference document not found.' }], isError: true }
      return { content: [{ type: 'text', text: referenceDocumentMarkdown(document) }], structuredContent: document }
    },
  )
  server.registerTool(
    'list_factions',
    {
      title: 'List factions in the Praetorium reference',
      description: 'Lists the factions that can be used to narrow reference searches.',
      inputSchema: {},
    },
    async () => {
      const corpus = activeReferenceCorpus()
      if (!corpus) return unavailable()
      const factions = [
        ...new Map(
          corpus.documents.flatMap((document) => (document.faction ? [[document.faction, { name: document.faction }]] : [])),
        ).values(),
      ].toSorted((left, right) => left.name.localeCompare(right.name))
      const result = { factions, revisions: corpus.catalogue.revisions }
      return { content: [{ type: 'text', text: JSON.stringify(result) }], structuredContent: result }
    },
  )
  return server
}

const unavailable = () => ({
  content: [{ type: 'text' as const, text: 'Praetorium reference data is temporarily unavailable.' }],
  isError: true as const,
})

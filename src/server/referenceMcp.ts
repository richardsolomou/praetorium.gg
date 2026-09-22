import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js'
import { z } from 'zod'
import { REFERENCE_KINDS } from '../contracts/reference'
import { app } from './app'
import { activeReferenceCorpus, referenceRateLimit } from './referenceApi'
import { referenceDocumentMarkdown } from './referenceCorpus'
import { PRAETORIUM_MCP_INSTRUCTIONS, praetoriumGuideMarkdown } from './referenceGuide'
import { REFERENCE_RESULT_MAX, searchReference, validReferenceCursor } from './referenceSearch'
import { referenceFactions, referenceIndex, referenceRecord, referenceUnits } from './referenceService'

const MCP_REQUEST_MAX_BYTES = 64 * 1024

export async function handleReferenceMcp(request: Request) {
  if (request.method !== 'POST') return referenceMcpResponse(methodNotAllowed())
  const limited = referenceRateLimit(request, 120)
  if (limited) return referenceMcpResponse(limited)
  const body = await boundedMcpBody(request)
  if ('error' in body) return referenceMcpResponse(body.error)
  const server = referenceMcpServer()
  const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true })
  try {
    await server.connect(transport)
    return referenceMcpResponse(await transport.handleRequest(request, { parsedBody: body.parsed }))
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
  headers.set('Cache-Control', 'no-store')
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers })
}

const methodNotAllowed = () =>
  Response.json(
    { jsonrpc: '2.0', error: { code: -32000, message: 'Method not allowed.' }, id: null },
    { status: 405, headers: { Allow: 'POST' } },
  )

const mcpError = (status: number, code: number, message: string) =>
  Response.json({ jsonrpc: '2.0', error: { code, message }, id: null }, { status })

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
  const server = new McpServer({ name: 'praetorium-reference', version: '1.0.0' }, { instructions: PRAETORIUM_MCP_INSTRUCTIONS })
  server.registerTool(
    'search_reference',
    {
      title: 'Search the Praetorium game reference',
      description:
        'Searches the verified mission, rules, detachment, and datasheet text used by Praetorium. Returns bounded excerpts with canonical URLs, source revisions, and attribution.',
      inputSchema: {
        query: z.string().trim().min(2).max(120).describe('Words, a printed rule number, an ability, a weapon, or a rules phrase.'),
        kinds: z.array(z.enum(REFERENCE_KINDS)).max(REFERENCE_KINDS.length).optional(),
        faction: z.string().trim().min(1).max(160).optional(),
        pack: z.string().trim().min(1).max(160).optional(),
        document: z.string().trim().min(1).max(160).optional(),
        limit: z.number().int().min(1).max(REFERENCE_RESULT_MAX).default(10),
        cursor: z
          .string()
          .refine((value) => validReferenceCursor(value), 'Cursor is not valid.')
          .optional(),
      },
      outputSchema: searchOutputSchema,
      annotations: READ_ONLY_TOOL,
    },
    async ({ query, kinds, faction, pack, document, limit, cursor }) => {
      const corpus = activeReferenceCorpus()
      if (!corpus) return unavailable()
      const result = searchReference(corpus, { query, kinds, faction, pack, document, limit, cursor })
      return structured(result)
    },
  )
  server.registerTool(
    'get_reference',
    {
      title: 'Read one Praetorium reference result',
      description:
        'Reads the complete bounded document returned by search_reference, with its source location, revisions, and attribution.',
      inputSchema: { id: z.string().min(1).max(400).describe('The stable result id returned by search_reference.') },
      outputSchema: referenceDocumentOutputSchema,
      annotations: READ_ONLY_TOOL,
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
    'get_reference_record',
    {
      title: 'Read structured Praetorium reference data',
      description:
        'Returns the source-faithful structured record behind a search result, including mission cards, deployments, terrain geometry, detachments, and datasheets.',
      inputSchema: { id: z.string().min(1).max(400).describe('The stable id returned by search_reference or list_reference.') },
      outputSchema: { document: referenceDocumentSchema, data: z.unknown() },
      annotations: READ_ONLY_TOOL,
    },
    async ({ id }) => {
      const corpus = activeReferenceCorpus()
      if (!corpus) return unavailable()
      const result = referenceRecord(corpus, app().rules(), id)
      if (!result) return { content: [{ type: 'text', text: 'Structured reference record not found.' }], isError: true }
      return structured(result)
    },
  )
  server.registerTool(
    'list_factions',
    {
      title: 'List factions in the Praetorium reference',
      description: 'Lists the factions that can be used to narrow reference searches.',
      inputSchema: {},
      outputSchema: { factions: z.array(factionSchema), revisions: revisionsSchema },
      annotations: READ_ONLY_TOOL,
    },
    async () => {
      const corpus = activeReferenceCorpus()
      if (!corpus) return unavailable()
      return structured({ factions: referenceFactions(corpus), revisions: corpus.catalogue.revisions })
    },
  )
  server.registerTool(
    'list_reference',
    {
      title: 'List the Praetorium reference catalogue',
      description: 'Discovers available factions, mission packs, rule documents, reference kinds, and active source revisions.',
      inputSchema: {},
      outputSchema: {
        corpusRevision: z.string(),
        revisions: revisionsSchema,
        kinds: z.record(z.string(), z.number().int().nonnegative()),
        factions: z.array(factionSchema),
        missionPacks: z.array(documentSummarySchema),
        ruleDocuments: z.array(
          z.object({ id: z.string(), slug: z.string(), title: z.string(), sections: z.number().int().nonnegative(), url: z.string() }),
        ),
      },
      annotations: READ_ONLY_TOOL,
    },
    async () => {
      const corpus = activeReferenceCorpus()
      if (!corpus) return unavailable()
      return structured(referenceIndex(corpus))
    },
  )
  server.registerTool(
    'list_units',
    {
      title: 'List compact faction units for roster planning',
      description:
        'Returns every pickable unit in one bounded response with unit-size costs, composition, attachment relationships, roster limits, roles, keywords, and links. Include a detachment to receive its complete rules, enhancements, upgrades, and stratagems without opening every unit page.',
      inputSchema: {
        faction: z.string().trim().min(1).max(160).describe('Faction id, URL slug, or display name from list_reference.'),
        battleSize: z.number().int().min(1).max(10_000).optional().describe('Battle size in points for size-dependent limits.'),
        detachment: z.string().trim().min(1).max(160).optional().describe('Detachment id, slug, or display name.'),
      },
      outputSchema: {
        faction: factionSchema,
        battleSize: z.number().int().nullable(),
        detachment: z.unknown().nullable(),
        units: z.array(unitSummarySchema),
        revisions: revisionsSchema,
      },
      annotations: READ_ONLY_TOOL,
    },
    async ({ faction, battleSize, detachment }) => {
      const corpus = activeReferenceCorpus()
      const instance = app()
      const loaded = instance.catalogue()
      if (!corpus || !loaded) return unavailable()
      const result = referenceUnits(corpus, loaded, instance.rules(), faction, battleSize, detachment)
      if (!result) return { content: [{ type: 'text', text: 'Faction or detachment not found.' }], isError: true }
      return structured(result)
    },
  )

  server.registerResource(
    'praetorium-guide',
    'praetorium://guide',
    {
      title: 'How Praetorium works',
      description: 'Product capabilities, privacy boundaries, data trust model, and efficient agent workflow.',
      mimeType: 'text/markdown',
    },
    async (uri) => ({ contents: [{ uri: uri.href, mimeType: 'text/markdown', text: praetoriumGuideMarkdown() }] }),
  )
  server.registerResource(
    'reference-status',
    'praetorium://reference-status',
    {
      title: 'Praetorium reference status',
      description: 'Active snapshot revisions and the available public reference catalogue.',
      mimeType: 'application/json',
    },
    async (uri) => {
      const corpus = activeReferenceCorpus()
      const status = corpus ? { available: true, ...referenceIndex(corpus) } : { available: false }
      return { contents: [{ uri: uri.href, mimeType: 'application/json', text: JSON.stringify(status, null, 2) }] }
    },
  )

  server.registerPrompt(
    'answer_rules_question',
    {
      title: 'Answer a game-rules question',
      description: 'Search the verified reference and answer with source URLs without guessing.',
      argsSchema: {
        question: z.string().trim().min(2).max(500),
        faction: z.string().trim().min(1).max(160).optional(),
      },
    },
    async ({ question, faction }) => ({
      messages: [
        {
          role: 'user',
          content: {
            type: 'text',
            text: `Answer this question from Praetorium's verified reference: ${question}\n\nFirst use search_reference${faction ? ` with faction ${faction}` : ''}, then read the relevant result. Cite its canonical URL and say explicitly if the source does not answer the question.`,
          },
        },
      ],
    }),
  )
  server.registerPrompt(
    'explain_mission_matchup',
    {
      title: 'Explain a mission matchup',
      description: 'Resolve a force-disposition pairing and explain its mission, scoring, deployment, and terrain.',
      argsSchema: {
        pack: z.string().trim().min(1).max(160),
        yourDisposition: z.string().trim().min(1).max(160),
        opponentDisposition: z.string().trim().min(1).max(160),
      },
    },
    async ({ pack, yourDisposition, opponentDisposition }) => ({
      messages: [
        {
          role: 'user',
          content: {
            type: 'text',
            text: `Use list_reference and search_reference with pack ${pack} to resolve ${yourDisposition} vs ${opponentDisposition}. Read the structured mission, deployment, and terrain records before explaining the primary scoring and setup. Cite canonical URLs and do not infer missing card text.`,
          },
        },
      ],
    }),
  )
  return server
}

const READ_ONLY_TOOL = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false } as const
const revisionsSchema = z.record(z.string(), z.string())
const factionSchema = z.object({
  id: z.string(),
  slug: z.string(),
  name: z.string(),
  datasheets: z.number().int().nonnegative(),
  detachments: z.number().int().nonnegative(),
})
const documentSummarySchema = z.object({ id: z.string(), title: z.string(), url: z.string() })
const referenceSectionSchema = z.object({ id: z.string(), title: z.string(), text: z.string(), url: z.string() })
const referenceDocumentSchema = z.object({
  id: z.string(),
  kind: z.enum(REFERENCE_KINDS),
  title: z.string(),
  faction: z.string().nullable(),
  url: z.string(),
  sections: z.array(referenceSectionSchema),
  revisions: revisionsSchema,
  attribution: z.array(z.string()),
})
const referenceDocumentOutputSchema = referenceDocumentSchema.shape
const searchOutputSchema = {
  query: z.string(),
  results: z.array(
    z.object({
      id: z.string(),
      kind: z.enum(REFERENCE_KINDS),
      title: z.string(),
      faction: z.string().nullable(),
      url: z.string(),
      section: z.object({ id: z.string(), title: z.string(), url: z.string() }),
      excerpt: z.string(),
      revisions: revisionsSchema,
      attribution: z.array(z.string()),
    }),
  ),
  revisions: revisionsSchema,
  nextCursor: z.string().nullable(),
}
const unitSummarySchema = z.object({
  id: z.string(),
  slug: z.string(),
  name: z.string(),
  group: z.string(),
  allied: z.boolean(),
  alliedFaction: z.string().nullable(),
  points: z.number().nullable(),
  limit: z.number().int().nullable(),
  keywords: z.array(z.string()),
  composition: z.array(z.string()),
  costs: z.array(
    z.object({
      models: z.string(),
      cost: z.string(),
      keyword: z.string().nullable(),
      faction: z.string().nullable(),
      detachment: z.string().nullable(),
    }),
  ),
  canLead: z.array(z.string()),
  canSupport: z.array(z.string()),
  canBeLedBy: z.array(z.string()),
  canBeSupportedBy: z.array(z.string()),
  url: z.string().nullable(),
  referenceId: z.string().nullable(),
})

function structured<T extends object>(result: T) {
  return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }], structuredContent: result }
}

const unavailable = () => ({
  content: [{ type: 'text' as const, text: 'Praetorium reference data is temporarily unavailable.' }],
  isError: true as const,
})

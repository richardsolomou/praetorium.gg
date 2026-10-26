import { z } from 'zod'
import { REFERENCE_KINDS } from '../contracts/reference'
import { activeReferenceCorpus, referenceDocumentFor, referenceRecordFor, referenceUnitsFor } from './referenceApi'
import { referenceDocumentMarkdown } from './referenceCorpus'
import {
  REFERENCE_FILTER_MAX_LENGTH,
  REFERENCE_QUERY_MAX_LENGTH,
  REFERENCE_RESULT_MAX,
  searchReference,
  validReferenceCursor,
} from './referenceSearch'
import {
  factionSummarySchema,
  referenceDocumentSchema,
  referenceIndexSchema,
  referenceSearchResponseSchema,
  revisionsSchema,
  unitSummarySchema,
} from './referenceSchemas'
import { referenceFactions, referenceIndex } from './referenceService'
import { READ_ONLY_TOOL, structured, type AgentTools } from './agentTools'

export function registerReferenceTools(server: AgentTools) {
  server.registerTool(
    'search_reference',
    {
      title: 'Search the Praetorium game reference',
      description:
        'Searches Praetorium’s missions, rules, detachments, and datasheets by name, number, keyword, and value. Returns bounded excerpts with canonical URLs, source revisions, and attribution. Rules text is not included; records point to it upstream.',
      inputSchema: {
        query: z
          .string()
          .trim()
          .min(2)
          .max(REFERENCE_QUERY_MAX_LENGTH)
          .describe('A name, a printed rule number, an ability, a weapon, or a keyword.'),
        kinds: z.array(z.enum(REFERENCE_KINDS)).max(REFERENCE_KINDS.length).optional(),
        faction: z.string().trim().min(1).max(REFERENCE_FILTER_MAX_LENGTH).optional(),
        pack: z.string().trim().min(1).max(REFERENCE_FILTER_MAX_LENGTH).optional(),
        document: z.string().trim().min(1).max(REFERENCE_FILTER_MAX_LENGTH).optional(),
        limit: z.number().int().min(1).max(REFERENCE_RESULT_MAX).default(10),
        cursor: z
          .string()
          .refine((value) => validReferenceCursor(value), 'Cursor is not valid.')
          .optional(),
      },
      outputSchema: referenceSearchResponseSchema.shape,
      annotations: READ_ONLY_TOOL,
    },
    async ({ query, kinds, faction, pack, document, limit, cursor }) => {
      const corpus = await activeReferenceCorpus()
      if (!corpus) return unavailable()
      const input = { query, kinds, faction, pack, document, limit, cursor }
      const result = searchReference(corpus, input)
      return structured(result)
    },
  )
  server.registerTool(
    'get_reference',
    {
      title: 'Read one Praetorium reference result',
      description:
        'Reads the complete bounded document returned by search_reference, with its revisions and attribution. A section that withholds rules text lists textSources: the pinned upstream file and record id to fetch if you need the wording.',
      inputSchema: { id: z.string().min(1).max(400).describe('The stable result id returned by search_reference.') },
      outputSchema: referenceDocumentSchema.shape,
      annotations: READ_ONLY_TOOL,
    },
    async ({ id }) => {
      const found = await referenceDocumentFor(id)
      if (!found) return unavailable()
      const { document } = found
      if (!document) return { content: [{ type: 'text', text: 'Reference document not found.' }], isError: true }
      return { content: [{ type: 'text', text: referenceDocumentMarkdown(document) }], structuredContent: document }
    },
  )
  server.registerTool(
    'get_reference_record',
    {
      title: 'Read structured Praetorium reference data',
      description:
        'Returns the structured record behind a search result, including mission cards, deployments, terrain geometry, detachments, and datasheets. Records that withhold rules text carry textSources pointing at the pinned upstream file and record id.',
      inputSchema: { id: z.string().min(1).max(400).describe('The stable id returned by search_reference or list_reference.') },
      outputSchema: { document: referenceDocumentSchema, data: z.unknown() },
      annotations: READ_ONLY_TOOL,
    },
    async ({ id }) => {
      const found = await referenceRecordFor(id)
      if (!found) return unavailable()
      const result = found.record
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
      outputSchema: { factions: z.array(factionSummarySchema), revisions: revisionsSchema },
      annotations: READ_ONLY_TOOL,
    },
    async () => {
      const corpus = await activeReferenceCorpus()
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
      outputSchema: referenceIndexSchema.shape,
      annotations: READ_ONLY_TOOL,
    },
    async () => {
      const corpus = await activeReferenceCorpus()
      if (!corpus) return unavailable()
      return structured(referenceIndex(corpus))
    },
  )
  server.registerTool(
    'list_units',
    {
      title: 'List compact faction units for roster planning',
      description:
        'Returns every pickable unit in one bounded response with unit-size costs, composition, attachment relationships, roster limits, roles, keywords, and links. Include a detachment, including one a chapter takes from its codex, to list only the units it allows and receive its rules, enhancements, upgrades, and stratagems by name, cost, and timing without opening every unit page. Their rules text is at each record’s textSources.',
      inputSchema: {
        faction: z
          .string()
          .trim()
          .min(1)
          .max(REFERENCE_FILTER_MAX_LENGTH)
          .describe('Faction id, URL slug, or display name from list_reference.'),
        battleSize: z.number().int().min(1).max(10_000).optional().describe('Battle size in points for size-dependent limits.'),
        detachment: z.string().trim().min(1).max(REFERENCE_FILTER_MAX_LENGTH).optional().describe('Detachment id, slug, or display name.'),
      },
      outputSchema: {
        faction: factionSummarySchema,
        battleSize: z.number().int().nullable(),
        detachment: z.unknown().nullable(),
        units: z.array(unitSummarySchema),
        revisions: revisionsSchema,
      },
      annotations: READ_ONLY_TOOL,
    },
    async ({ faction, battleSize, detachment }) => {
      const found = await referenceUnitsFor(faction, battleSize, detachment)
      if (!found) return unavailable()
      const result = found.units
      if (!result) return { content: [{ type: 'text', text: 'Faction or detachment not found.' }], isError: true }
      return structured(result)
    },
  )
}

const unavailable = () => ({
  content: [{ type: 'text' as const, text: 'Praetorium reference data is temporarily unavailable.' }],
  isError: true as const,
})

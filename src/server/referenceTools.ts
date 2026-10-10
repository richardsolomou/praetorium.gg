import { z } from 'zod'
import { REFERENCE_KINDS } from '../contracts/reference'
import { app } from './app'
import { activeReferenceCorpus } from './referenceApi'
import { referenceDocumentMarkdown } from './referenceCorpus'
import { REFERENCE_RESULT_MAX, searchReference, validReferenceCursor } from './referenceSearch'
import {
  referenceFaction,
  referenceFactions,
  referenceIndex,
  referenceRecord,
  referenceRecordCatalogueId,
  referenceUnits,
} from './referenceService'
import type { AgentTools } from './agentTools'

export function registerReferenceTools(server: AgentTools) {
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
        'Reads the complete bounded document returned by search_reference, with its source location, revisions, and attribution.',
      inputSchema: { id: z.string().min(1).max(400).describe('The stable result id returned by search_reference.') },
      outputSchema: referenceDocumentOutputSchema,
      annotations: READ_ONLY_TOOL,
    },
    async ({ id }) => {
      const catalogueId = referenceRecordCatalogueId(id)
      const corpus = await activeReferenceCorpus(catalogueId)
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
      const catalogueId = referenceRecordCatalogueId(id)
      const corpus = await activeReferenceCorpus(catalogueId)
      if (!corpus) return unavailable()
      const result = referenceRecord(corpus, await app().rulesFor(catalogueId), id)
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
      const instance = app()
      const corpus = await activeReferenceCorpus(faction)
      const selected = corpus && referenceFaction(corpus, faction)
      const [loaded, rules] = await Promise.all([
        instance.catalogueFor(selected?.id ?? faction),
        instance.rulesFor(selected?.id ?? faction),
      ])
      if (!corpus || !loaded) return unavailable()
      const result = referenceUnits(corpus, loaded, rules, faction, battleSize, detachment)
      if (!result) return { content: [{ type: 'text', text: 'Faction or detachment not found.' }], isError: true }
      return structured(result)
    },
  )
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

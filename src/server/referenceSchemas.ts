import { z } from 'zod'
import { REFERENCE_KINDS } from '../contracts/reference'
import { TEXT_SOURCES } from '../shared/sourceText'
import { REFERENCE_EXCERPT_MAX_LENGTH, REFERENCE_RESULT_MAX } from './referenceSearch'

/** What the reference answers, shared by the MCP tools' output schemas and the OpenAPI document. */
export const revisionsSchema = z.record(z.string(), z.string())
const attributionSchema = z.array(z.string())

export const factionSummarySchema = z.object({
  id: z.string(),
  slug: z.string(),
  name: z.string(),
  datasheets: z.number().int().nonnegative(),
  detachments: z.number().int().nonnegative(),
})

export const documentSummarySchema = z.object({ id: z.string(), title: z.string(), url: z.string() })

export const referenceIndexSchema = z.object({
  corpusRevision: z.string(),
  revisions: revisionsSchema,
  kinds: z.record(z.string(), z.number().int().nonnegative()),
  factions: z.array(factionSummarySchema),
  missionPacks: z.array(documentSummarySchema),
  ruleDocuments: z.array(
    z.object({ id: z.string(), slug: z.string(), title: z.string(), sections: z.number().int().nonnegative(), url: z.string() }),
  ),
})

export const textSourcesSchema = z
  .array(z.object({ source: z.enum(TEXT_SOURCES), url: z.url(), id: z.string().optional() }))
  .describe(
    'Where withheld rules text lives upstream: the pinned file, its source, and the id of the record holding it there when the file has one. Fetch it there if you need the wording.',
  )

export const referenceSectionSchema = z.object({
  id: z.string(),
  title: z.string(),
  text: z.string(),
  url: z.string(),
  textSources: textSourcesSchema.optional(),
})

export const referenceDocumentSchema = z.object({
  id: z.string(),
  kind: z.enum(REFERENCE_KINDS),
  title: z.string(),
  faction: z.string().nullable(),
  url: z.string(),
  sections: z.array(referenceSectionSchema),
  revisions: revisionsSchema,
  attribution: attributionSchema,
})

export const referenceSearchResultSchema = z.object({
  id: z.string(),
  kind: z.enum(REFERENCE_KINDS),
  title: z.string(),
  faction: z.string().nullable(),
  url: z.string(),
  section: z.object({ id: z.string(), title: z.string(), url: z.string(), textSources: textSourcesSchema.optional() }),
  excerpt: z.string().max(REFERENCE_EXCERPT_MAX_LENGTH),
  revisions: revisionsSchema,
  attribution: attributionSchema,
})

export const referenceSearchResponseSchema = z.object({
  query: z.string(),
  results: z.array(referenceSearchResultSchema).max(REFERENCE_RESULT_MAX),
  revisions: revisionsSchema,
  nextCursor: z.string().nullable(),
})

export const unitSummarySchema = z.object({
  id: z.string(),
  slug: z.string(),
  name: z.string(),
  group: z.string(),
  allied: z.boolean(),
  alliedFaction: z.string().nullable(),
  points: z.number().nullable(),
  limit: z.number().int().nonnegative().nullable(),
  keywords: z.array(z.string()),
  composition: z.array(z.string()),
  costs: z.array(
    z.object({
      models: z.string(),
      cost: z.string(),
      keyword: z.string().optional(),
      faction: z.string().optional(),
      detachment: z.string().optional(),
      copies: z.string().optional(),
    }),
  ),
  canLead: z.array(z.string()),
  canSupport: z.array(z.string()),
  canBeLedBy: z.array(z.string()),
  canBeSupportedBy: z.array(z.string()),
  url: z.string().nullable(),
  referenceId: z.string().nullable(),
})

import { z } from 'zod'
import rawSources from '../../catalogue/sources.json' with { type: 'json' }

const repositorySourceSchema = z.object({
  repository: z.string().regex(/^[\w.-]+\/[\w.-]+$/, 'expected owner/name'),
  branch: z.string().min(1),
  revision: z.string().regex(/^[0-9a-f]{40}$/, 'expected a full commit sha, so the data cannot move underneath us'),
  path: z.string().optional(),
  attribution: z.string().optional(),
  description: z.string().optional(),
})

const wahapediaSourceSchema = z.object({
  baseUrl: z.literal('https://wahapedia.ru/wh40k11ed'),
  revision: z.string().min(1),
  files: z.record(z.string().regex(/^[\w.-]+\.csv$/), z.string().regex(/^[0-9a-f]{64}$/)),
  pages: z.record(z.string().regex(/^[\w-]+$/), z.string().regex(/^[0-9a-f]{64}$/)),
  attribution: z.string().min(1),
  description: z.string().optional(),
})

const battlemasterSourceSchema = z.object({
  baseUrl: z.literal('https://battlemaster.online'),
  owner: z.string().min(1),
  missionPack: z.literal('chapter-approved-2026'),
  revision: z.string().regex(/^[0-9a-f]{64}$/, 'expected the SHA-256 of the pinned catalog key'),
  attribution: z.string().min(1),
  description: z.string().optional(),
})

export const catalogueSourcesSchema = z.object({
  definitions: repositorySourceSchema,
  points: repositorySourceSchema,
  rules: repositorySourceSchema,
  battlemaster: battlemasterSourceSchema,
  wahapedia: wahapediaSourceSchema,
})

export const SOURCE_NAMES = ['definitions', 'points', 'rules'] as const
export type SourceName = (typeof SOURCE_NAMES)[number]
export type WahapediaSource = Pick<z.infer<typeof wahapediaSourceSchema>, 'revision' | 'files' | 'pages'> & { baseUrl: string }
export type BattlemasterSource = z.infer<typeof battlemasterSourceSchema>

export const catalogueSources = catalogueSourcesSchema.parse(rawSources)

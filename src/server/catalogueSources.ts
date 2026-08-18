import { z } from 'zod'
import rawSources from '../../catalogue/sources.json' with { type: 'json' }

const repositorySourceSchema = z.object({
  repository: z.string().regex(/^[\w.-]+\/[\w.-]+$/, 'expected owner/name'),
  branch: z.string().min(1),
  path: z.string().optional(),
  attribution: z.string().optional(),
  description: z.string().optional(),
})

const wahapediaSourceSchema = z.object({
  baseUrl: z.literal('https://wahapedia.ru/wh40k11ed'),
  files: z.array(z.string().regex(/^[\w.-]+\.csv$/)),
  pages: z.array(z.string().regex(/^[\w-]+$/)),
  attribution: z.string().min(1),
  description: z.string().optional(),
})

const battlemasterSourceSchema = z.object({
  baseUrl: z.literal('https://battlemaster.online'),
  owner: z.string().min(1),
  missionPack: z.literal('chapter-approved-2026'),
  attribution: z.string().min(1),
  description: z.string().optional(),
})

export const catalogueSourcesSchema = z.object({
  definitions: repositorySourceSchema,
  points: repositorySourceSchema,
  rules: repositorySourceSchema,
  datacards: repositorySourceSchema,
  battlemaster: battlemasterSourceSchema,
  wahapedia: wahapediaSourceSchema,
})

export const SOURCE_NAMES = ['definitions', 'points', 'rules', 'datacards'] as const
export type SourceName = (typeof SOURCE_NAMES)[number]
export type CatalogueSourceConfig = z.infer<typeof catalogueSourcesSchema>
export type ResolvedCatalogueSources = Omit<
  CatalogueSourceConfig,
  'definitions' | 'points' | 'rules' | 'datacards' | 'battlemaster' | 'wahapedia'
> & {
  definitions: CatalogueSourceConfig['definitions'] & { revision: string }
  points: CatalogueSourceConfig['points'] & { revision: string }
  rules: CatalogueSourceConfig['rules'] & { revision: string }
  datacards: CatalogueSourceConfig['datacards'] & { revision: string }
  battlemaster: CatalogueSourceConfig['battlemaster'] & { revision: string }
  wahapedia: Omit<CatalogueSourceConfig['wahapedia'], 'baseUrl' | 'files' | 'pages'> & {
    baseUrl: string
    revision: string
    files: Record<string, string>
    pages: Record<string, string>
  }
}
export type WahapediaSource = ResolvedCatalogueSources['wahapedia']
export type BattlemasterSource = ResolvedCatalogueSources['battlemaster']

export const catalogueSources = catalogueSourcesSchema.parse(rawSources)

import { z } from 'zod'
import rawSources from '../../catalogue/sources.json' with { type: 'json' }

const repositorySourceSchema = z.object({
  repository: z.string().regex(/^[\w.-]+\/[\w.-]+$/, 'expected owner/name'),
  branch: z.string().min(1),
  path: z.string().optional(),
  license: z.string().min(1).nullable(),
  licenseUrl: z.url().optional(),
  attribution: z.string().optional(),
  description: z.string().optional(),
})

const battlemasterSourceSchema = z.object({
  baseUrl: z.literal('https://battlemaster.online'),
  owner: z.string().min(1),
  missionPack: z.literal('chapter-approved-2026'),
  license: z.string().min(1).nullable(),
  licenseUrl: z.url().optional(),
  attribution: z.string().min(1),
  description: z.string().optional(),
})

export const catalogueSourcesSchema = z.object({
  definitions: repositorySourceSchema,
  points: repositorySourceSchema,
  rules: repositorySourceSchema,
  datacards: repositorySourceSchema,
  battlemaster: battlemasterSourceSchema,
})

export const SOURCE_NAMES = ['definitions', 'points', 'rules', 'datacards'] as const
export type SourceName = (typeof SOURCE_NAMES)[number]
export const SNAPSHOT_SOURCE_NAMES = [...SOURCE_NAMES, 'battlemaster'] as const
export type SnapshotSourceName = (typeof SNAPSHOT_SOURCE_NAMES)[number]

export function isSnapshotSourceName(value: string): value is SnapshotSourceName {
  return (SNAPSHOT_SOURCE_NAMES as readonly string[]).includes(value)
}
export type CatalogueSourceConfig = z.infer<typeof catalogueSourcesSchema>
export type ResolvedCatalogueSources = Omit<CatalogueSourceConfig, 'definitions' | 'points' | 'rules' | 'datacards' | 'battlemaster'> & {
  definitions: CatalogueSourceConfig['definitions'] & { revision: string }
  points: CatalogueSourceConfig['points'] & { revision: string }
  rules: CatalogueSourceConfig['rules'] & { revision: string }
  datacards: CatalogueSourceConfig['datacards'] & { revision: string }
  battlemaster: CatalogueSourceConfig['battlemaster'] & { revision: string }
}
export type BattlemasterSource = ResolvedCatalogueSources['battlemaster']

export const catalogueSources = catalogueSourcesSchema.parse(rawSources)

export function disabledCatalogueSources(value = process.env.CATALOGUE_DISABLED_SOURCES): ReadonlySet<SnapshotSourceName> {
  const disabled = new Set<SnapshotSourceName>()
  for (const name of value
    ?.split(',')
    .map((entry) => entry.trim())
    .filter(Boolean) ?? []) {
    if (!isSnapshotSourceName(name)) throw new Error(`unknown disabled catalogue source ${name}`)
    disabled.add(name)
  }
  return disabled
}

import { z } from 'zod'
import rawSources from '../../catalogue/sources.json' with { type: 'json' }

export const repositorySourceSchema = z.object({
  repository: z.string().regex(/^[\w.-]+\/[\w.-]+$/, 'expected owner/name'),
  branch: z.string().min(1),
  revision: z.string().regex(/^[0-9a-f]{40}$/, 'expected a full Git commit SHA'),
  path: z
    .string()
    .refine(
      (value) => !value.startsWith('/') && !value.split('/').some((part) => part === '..' || !part),
      'expected a relative source path',
    )
    .optional(),
  license: z.string().min(1).nullable(),
  licenseUrl: z.url().optional(),
  attribution: z.string().optional(),
  description: z.string().optional(),
})

const battlemasterSourceSchema = z.object({
  revision: z.string().regex(/^[0-9a-f]{64}$/, 'expected a SHA-256 catalogue hash'),
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
  datacards: repositorySourceSchema,
  icons: repositorySourceSchema.extend({
    icons: z
      .record(z.string().regex(/^[a-z0-9-]+$/), z.string())
      .refine((icons) => Object.keys(icons).length > 0, 'icon selection is empty'),
  }),
  battlemaster: battlemasterSourceSchema,
})

export const SOURCE_NAMES = ['definitions', 'points', 'datacards'] as const
export type SourceName = (typeof SOURCE_NAMES)[number]
export const SNAPSHOT_SOURCE_NAMES = [...SOURCE_NAMES, 'battlemaster', 'icons'] as const
/** Sources earlier published snapshots carry; they are read as history and never materialized again. */
const RETIRED_SOURCE_NAMES = ['rules', 'marineCodex'] as const
export type SnapshotSourceName = (typeof SNAPSHOT_SOURCE_NAMES)[number] | (typeof RETIRED_SOURCE_NAMES)[number]

export function isSnapshotSourceName(value: string): value is SnapshotSourceName {
  return [...RETIRED_SOURCE_NAMES, ...SNAPSHOT_SOURCE_NAMES].some((name) => name === value)
}
export type CatalogueSourceConfig = z.infer<typeof catalogueSourcesSchema>
export type BattlemasterSource = CatalogueSourceConfig['battlemaster']

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

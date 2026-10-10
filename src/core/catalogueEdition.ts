import { z } from 'zod'
import type { CatalogueFile } from './catalogue'
import type { RosterPick } from './roster'

export const catalogueEditionSummarySchema = z.object({
  id: z.string().regex(/^[a-z0-9][a-z0-9-]{0,19}$/),
  name: z.string().trim().min(1).max(80),
  status: z.enum(['preview', 'released', 'retired']),
})

export const catalogueEditionSchema = catalogueEditionSummarySchema
  .extend({
    default: z.boolean().default(false),
    catalogueIds: z
      .array(
        z
          .string()
          .min(1)
          .max(40)
          .regex(/^[^~]+$/),
      )
      .min(1)
      .max(64),
    releases: z
      .array(z.object({ at: z.number().int().nonnegative(), status: z.enum(['preview', 'released', 'retired']) }))
      .min(1)
      .max(100),
  })
  .superRefine((edition, context) => {
    if (edition.default && edition.status !== 'released')
      context.addIssue({ code: 'custom', message: 'only released rules can be the default' })
    if (new Set(edition.catalogueIds).size !== edition.catalogueIds.length)
      context.addIssue({ code: 'custom', message: 'duplicate catalogue IDs' })
    if (edition.releases.at(-1)?.status !== edition.status)
      context.addIssue({ code: 'custom', message: 'release history must end at the current status' })
    if (edition.releases.some((release, index) => index > 0 && release.at <= edition.releases[index - 1]!.at))
      context.addIssue({ code: 'custom', message: 'release history must be chronological' })
  })

export type CatalogueEdition = z.infer<typeof catalogueEditionSchema>

export const editionCatalogueId = (editionId: string, catalogueId: string) => `${editionId}~${catalogueId}`

export function catalogueEditionId(catalogueId: string) {
  return catalogueId.includes('~') ? catalogueId.split('~', 1)[0]! : null
}

export const editionLabel = (edition: Pick<CatalogueEdition, 'name' | 'status'>) =>
  `${edition.name}${edition.status === 'preview' ? ' · Preview' : edition.status === 'retired' ? ' · Previous' : ''}`

export const editionFamilyId = (catalogueId: string) => catalogueId.split('~').at(-1)!

export function picksForCatalogueEdition<T extends RosterPick>(picks: readonly T[], catalogueId: string): T[] {
  const edition = catalogueEditionId(catalogueId)
  return picks.map((pick) =>
    pick.catalogueId
      ? {
          ...pick,
          catalogueId: edition ? editionCatalogueId(edition, editionFamilyId(pick.catalogueId)) : editionFamilyId(pick.catalogueId),
        }
      : pick,
  )
}

export function editionCatalogueFiles(files: readonly CatalogueFile[], edition: CatalogueEdition): CatalogueFile[] {
  const ids = new Map(
    files.flatMap((file) => (file.catalogue ? [[file.catalogue.id, editionCatalogueId(edition.id, file.catalogue.id)] as const] : [])),
  )
  const replace = (value: unknown, key = ''): unknown => {
    if (typeof value === 'string')
      return ['id', 'targetId', 'childId', 'scope', 'gameSystemId', 'catalogueId'].includes(key) ? (ids.get(value) ?? value) : value
    if (Array.isArray(value)) return value.map((child) => replace(child, key))
    if (value && typeof value === 'object')
      return Object.fromEntries(Object.entries(value).map(([field, child]) => [field, replace(child, field)]))
    return value
  }
  return files.map((file) => replace(file) as CatalogueFile)
}

export const leagueEditionError = (edition?: Pick<CatalogueEdition, 'status'>) =>
  edition?.status === 'preview' ? 'preview rules cannot be submitted to a league' : null

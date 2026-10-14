import { z } from 'zod'
import rawMigrations from '../../catalogue/edition-migrations.json' with { type: 'json' }
import type { RosterPick } from './roster'
import { catalogueEditionId, editionCatalogueId, editionFamilyId } from './catalogueEdition'

const optionSchema = z.object({ key: z.string(), id: z.string() })
const migrations = Object.values(
  z
    .record(
      z.string(),
      z.object({
        from: z.array(z.string()).min(1),
        /** `null` is the current rules, which a roster follows through later releases of the same MFM version. */
        to: z.string().nullable(),
        /** The books these versions offered, which are the only saved IDs on them. */
        catalogueIds: z.array(z.string()).min(1),
        reason: z.string().min(1),
        datasheets: z.record(z.string(), z.object({ choices: z.record(z.string(), z.record(z.string(), optionSchema)) })),
      }),
    )
    .parse(rawMigrations),
)
const byEdition = new Map(migrations.flatMap((migration) => migration.from.map((edition) => [edition, migration] as const)))

/** A saved ID on a folded rules version, read on the version it folded into; any other ID is kept. */
export function migratedEditionId(catalogueId: string) {
  const migration = byEdition.get(catalogueEditionId(catalogueId) ?? '')
  if (!migration) return catalogueId
  const book = editionFamilyId(catalogueId)
  return migration.to ? editionCatalogueId(migration.to, book) : book
}

/** Whether a saved ID belongs to a rules version that folded into another. */
export const onFoldedEdition = (catalogueId: string) => byEdition.has(catalogueEditionId(catalogueId) ?? '')

/** A pick on a folded rules version: its allied book follows the roster, and verified options move with it. */
export function migratedEditionPick<T extends RosterPick>(pick: T, catalogueId: string): T {
  const migration = byEdition.get(catalogueEditionId(catalogueId) ?? '')
  if (!migration) return pick
  const sheet = migration.datasheets[pick.entryId]
  const option = (key: string, id: string) => sheet?.choices[key]?.[id] ?? { key, id }
  return {
    ...pick,
    ...(pick.catalogueId ? { catalogueId: migratedEditionId(pick.catalogueId) } : {}),
    ...(sheet && pick.choices
      ? { choices: Object.fromEntries(Object.entries(pick.choices).map(([key, id]) => Object.values(option(key, id)))) }
      : {}),
  }
}

/** The saved IDs on folded rules versions that read as this one. */
export const foldedEditionIds = (catalogueId: string) =>
  [...byEdition]
    .filter(([, migration]) => migration.catalogueIds.includes(editionFamilyId(catalogueId)))
    .map(([edition]) => editionCatalogueId(edition, editionFamilyId(catalogueId)))
    .filter((id) => migratedEditionId(id) === catalogueId)

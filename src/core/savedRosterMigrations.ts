import { z } from 'zod'
import { editionCatalogueId, picksForCatalogueEdition } from './catalogueEdition'
import { migratedEditionId, migratedEditionPick, onFoldedEdition } from './editionMigrations'
import { retainedRulesEdition } from './retainedRosterRules'
import type { RosterPick } from './roster'
import { migrateSavedRoster } from './retiredRosterFields'

export function migrateStoredRoster<
  T extends {
    name: string
    catalogueId: string
    automaticName?: boolean | null
    locked?: boolean | null
    detachmentId?: string | null
    borrowedDetachmentId?: string | null
    picks: string
    prep?: string | null
    updatedAt?: bigint | number
    /** Saved by code that starts a choice on its printed default; a row without it gets `floor` on every unit, once. */
    printedDefaults?: boolean | null
  },
>(row: T) {
  if (row.picks.length > 1_000_000 || (row.prep?.length ?? 0) > 100_000 || (row.detachmentId?.length ?? 0) > 1_000)
    throw new Error('Saved roster exceeds migration limits')
  const savedPicks = z.array(z.record(z.string(), z.unknown())).parse(JSON.parse(row.picks)) as unknown as RosterPick[]
  const prep = row.prep ? z.record(z.string(), z.unknown()).parse(JSON.parse(row.prep)) : null
  const detachments = row.detachmentId
    ? row.detachmentId.startsWith('[')
      ? z.array(z.string()).parse(JSON.parse(row.detachmentId))
      : [row.detachmentId]
    : []
  const picks = row.printedDefaults ? savedPicks : flooredPicks(savedPicks)
  const folded = onFoldedEdition(row.catalogueId)
  // Any later write bumps `updatedAt`, so the rules version its current date selects is stored before one can move it.
  const retained = folded
    ? null
    : retainedRulesEdition({
        catalogueId: row.catalogueId,
        detachmentIds: detachments,
        borrowedDetachmentId: row.borrowedDetachmentId,
        picks,
        updatedAt: row.updatedAt === undefined ? undefined : Number(row.updatedAt),
      })
  const catalogueId = retained ? editionCatalogueId(retained, row.catalogueId) : migratedEditionId(row.catalogueId)
  const migrated = migrateSavedRoster({
    picks: folded
      ? picks.map((pick) => migratedEditionPick(pick, row.catalogueId))
      : retained
        ? picksForCatalogueEdition(picks, catalogueId)
        : picks,
    prep,
  }) as { picks: unknown; prep: unknown }
  return {
    ...row,
    printedDefaults: true,
    catalogueId,
    automaticName: row.automaticName ?? !row.name,
    locked: row.locked ?? false,
    detachmentId: JSON.stringify(detachments),
    picks: JSON.stringify(migrated.picks) === JSON.stringify(savedPicks) ? row.picks : JSON.stringify(migrated.picks),
    prep: JSON.stringify(migrated.prep) === JSON.stringify(prep) ? row.prep : JSON.stringify(migrated.prep),
  }
}

/** Every unit marked to keep the cheapest option of each choice it never made, as it was saved before a printed default won. */
export const flooredPicks = <T extends RosterPick>(picks: readonly T[]): T[] =>
  picks.map((pick) => (pick.floor ? pick : { ...pick, floor: true }))

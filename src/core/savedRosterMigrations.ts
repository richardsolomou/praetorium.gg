import { z } from 'zod'
import { migratedEditionId, migratedEditionPick, onFoldedEdition } from './editionMigrations'
import type { RosterPick } from './roster'

function omitRetired(value: unknown, field: string): unknown {
  if (!value || typeof value !== 'object' || Array.isArray(value) || !(field in value)) return value
  const { [field]: _retired, ...rest } = value as Record<string, unknown>
  return rest
}

export function migrateSavedRoster(value: unknown): unknown {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return value
  const roster = value as Record<string, unknown>
  return {
    ...roster,
    ...('prep' in roster ? { prep: omitRetired(roster.prep, 'shareNotes') } : {}),
  }
}

export function migrateStoredRoster<
  T extends {
    name: string
    catalogueId: string
    automaticName?: boolean | null
    locked?: boolean | null
    detachmentId?: string | null
    picks: string
    prep?: string | null
  },
>(row: T) {
  if (row.picks.length > 1_000_000 || (row.prep?.length ?? 0) > 100_000 || (row.detachmentId?.length ?? 0) > 1_000)
    throw new Error('Saved roster exceeds migration limits')
  const picks = z.array(z.record(z.string(), z.unknown())).parse(JSON.parse(row.picks))
  const prep = row.prep ? z.record(z.string(), z.unknown()).parse(JSON.parse(row.prep)) : null
  const folded = onFoldedEdition(row.catalogueId)
  const migrated = migrateSavedRoster({
    picks: folded ? picks.map((pick) => migratedEditionPick(pick as unknown as RosterPick, row.catalogueId)) : picks,
    prep,
  }) as { picks: unknown; prep: unknown }
  const detachments = row.detachmentId
    ? row.detachmentId.startsWith('[')
      ? z.array(z.string()).parse(JSON.parse(row.detachmentId))
      : [row.detachmentId]
    : []
  return {
    ...row,
    catalogueId: migratedEditionId(row.catalogueId),
    automaticName: row.automaticName ?? !row.name,
    locked: row.locked ?? false,
    detachmentId: JSON.stringify(detachments),
    picks: JSON.stringify(migrated.picks) === JSON.stringify(picks) ? row.picks : JSON.stringify(migrated.picks),
    prep: JSON.stringify(migrated.prep) === JSON.stringify(prep) ? row.prep : JSON.stringify(migrated.prep),
  }
}

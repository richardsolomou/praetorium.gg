import type { CollectionProgress } from './collection'

export type ReadinessRow = {
  entryId: string
  name: string
  units: number
  needed: number
  owned: number
  built: number
  painted: number
  wanted: number
  /** Models to buy: every roster unit of a datasheet draws on the one count, so two units compete for the same models. */
  short: number
  toBuild: number
  toPaint: number
}

/**
 * How far a player's collection is from fielding a roster, by datasheet.
 *
 * Equipment is not counted, so a mixed loadout reads as ready whenever there are enough models.
 */
export function rosterReadiness(
  units: readonly { entryId: string; name: string; models: number }[],
  collection: {
    counts: Readonly<Record<string, number>>
    progress: Readonly<Record<string, CollectionProgress>>
    wishes: Readonly<Record<string, number>>
  },
) {
  const rows = new Map<string, ReadinessRow>()
  for (const unit of units) {
    const row = rows.get(unit.entryId)
    if (row) {
      row.units++
      row.needed += unit.models
      continue
    }
    const progress = collection.progress[unit.entryId]
    rows.set(unit.entryId, {
      entryId: unit.entryId,
      name: unit.name,
      units: 1,
      needed: unit.models,
      owned: collection.counts[unit.entryId] ?? 0,
      built: progress?.built ?? 0,
      painted: progress?.painted ?? 0,
      wanted: collection.wishes[unit.entryId] ?? 0,
      short: 0,
      toBuild: 0,
      toPaint: 0,
    })
  }
  const datasheets = [...rows.values()].map((row) => ({
    ...row,
    short: Math.max(0, row.needed - row.owned),
    toBuild: Math.max(0, Math.min(row.needed, row.owned) - row.built),
    toPaint: Math.max(0, Math.min(row.needed, row.built) - row.painted),
  }))
  const total = (field: 'needed' | 'short' | 'toBuild' | 'toPaint') => datasheets.reduce((sum, row) => sum + row[field], 0)
  return {
    datasheets,
    needed: total('needed'),
    short: total('short'),
    toBuild: total('toBuild'),
    toPaint: total('toPaint'),
    painted: datasheets.reduce((sum, row) => sum + Math.min(row.needed, row.painted), 0),
  }
}

export type RosterReadiness = ReturnType<typeof rosterReadiness>

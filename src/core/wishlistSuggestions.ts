import { countBy } from './collections'
import { compareText } from './text'

/**
 * Datasheets in the player's armies that none of the player's own rosters use.
 *
 * Each army's other-player rosters are counted apart, so a suggestion leads by the share of its army's rosters that field it.
 * Other unused datasheets follow the counted ones, by name.
 */
export function wishlistSuggestions(
  own: readonly { entryIds: readonly string[] }[],
  armies: readonly { rosters: readonly { entryIds: readonly string[] }[]; datasheets: readonly { id: string; name: string }[] }[],
) {
  const used = new Set(own.flatMap((roster) => roster.entryIds))
  const fielded = armies.flatMap(({ rosters }) => {
    const counts = countBy(
      rosters.flatMap((roster) => [...new Set(roster.entryIds)].filter((entryId) => !used.has(entryId))),
      (entryId) => entryId,
    )
    return [...counts].map(([entryId, count]) => ({ entryId, rosters: count, of: rosters.length }))
  })
  const suggested = new Set(fielded.map(({ entryId }) => entryId))
  const unfielded = [...new Map(armies.flatMap(({ datasheets }) => datasheets.map((sheet) => [sheet.id, sheet] as const))).values()]
    .filter((datasheet) => !used.has(datasheet.id) && !suggested.has(datasheet.id))
    .toSorted((a, b) => a.name.localeCompare(b.name))
    .map((datasheet) => ({ entryId: datasheet.id, rosters: 0, of: 0 }))
  return [
    ...fielded.toSorted((a, b) => b.rosters / b.of - a.rosters / a.of || b.rosters - a.rosters || compareText(a.entryId, b.entryId)),
    ...unfielded,
  ]
}

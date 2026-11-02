import { countBy } from './collections'
import { compareText } from './text'

/**
 * Datasheets other players field in the player's armies that none of the player's own rosters use.
 *
 * Each army's other-player rosters are counted apart, so a suggestion leads by the share of its army's rosters that field it, and
 * names the army it was suggested for: a datasheet many armies share, such as a fortification, belongs to none of them in particular.
 * A datasheet nobody fields is never suggested.
 */
export function wishlistSuggestions(
  own: readonly { entryIds: readonly string[] }[],
  armies: readonly { catalogueId: string; rosters: readonly { entryIds: readonly string[] }[] }[],
) {
  const used = new Set(own.flatMap((roster) => roster.entryIds))
  return armies
    .flatMap(({ catalogueId, rosters }) => {
      const counts = countBy(
        rosters.flatMap((roster) => [...new Set(roster.entryIds)].filter((entryId) => !used.has(entryId))),
        (entryId) => entryId,
      )
      return [...counts].map(([entryId, count]) => ({ entryId, catalogueId, rosters: count, of: rosters.length }))
    })
    .toSorted((a, b) => b.rosters / b.of - a.rosters / a.of || b.rosters - a.rosters || compareText(a.entryId, b.entryId))
}

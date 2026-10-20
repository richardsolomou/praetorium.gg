/**
 * Datasheets in the player's armies that none of the player's own rosters use.
 *
 * Each army's other-player rosters are counted apart, so a suggestion leads by the share of its army's rosters that field it.
 * An army with no such rosters offers all its unused datasheets after the counted ones, by name.
 */
export function wishlistSuggestions(
  own: readonly { entryIds: readonly string[] }[],
  armies: readonly { rosters: readonly { entryIds: readonly string[] }[]; datasheets: readonly { id: string; name: string }[] }[],
) {
  const used = new Set(own.flatMap((roster) => roster.entryIds))
  const fielded = armies.flatMap(({ rosters }) => {
    const counts = new Map<string, number>()
    for (const roster of rosters)
      for (const entryId of new Set(roster.entryIds)) if (!used.has(entryId)) counts.set(entryId, (counts.get(entryId) ?? 0) + 1)
    return [...counts].map(([entryId, count]) => ({ entryId, rosters: count, of: rosters.length }))
  })
  const unfielded = [
    ...new Map(
      armies.flatMap(({ rosters, datasheets }) => (rosters.length ? [] : datasheets.map((sheet) => [sheet.id, sheet] as const))),
    ).values(),
  ]
    .filter((datasheet) => !used.has(datasheet.id))
    .toSorted((a, b) => a.name.localeCompare(b.name))
    .map((datasheet) => ({ entryId: datasheet.id, rosters: 0, of: 0 }))
  return [
    ...fielded.toSorted((a, b) => b.rosters / b.of - a.rosters / a.of || b.rosters - a.rosters || a.entryId.localeCompare(b.entryId)),
    ...unfielded,
  ]
}

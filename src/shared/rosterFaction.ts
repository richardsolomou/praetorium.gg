/** The part of a faction index entry a roster row names its army with, so a page showing a few rows needn't ship the whole index. */
export const rosterFaction = <Edition>(faction: {
  slug: string
  displayName: string
  icon: string | null
  edition?: Edition
  detachments: readonly { id: string; name: string }[]
}) => ({
  slug: faction.slug,
  displayName: faction.displayName,
  icon: faction.icon,
  edition: faction.edition,
  detachments: faction.detachments.map(({ id, name }) => ({ id, name })),
})

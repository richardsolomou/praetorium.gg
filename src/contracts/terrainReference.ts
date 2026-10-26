export const TERRAIN_GEOMETRY_VERSION = 8

export const terrainMatchupIds = (dispositions: readonly string[]) => {
  if (dispositions.length !== 2) return []
  const [first, second] = dispositions
  return [...new Set([`${first}-vs-${second}`, `${second}-vs-${first}`])].toSorted()
}

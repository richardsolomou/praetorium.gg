export const TERRAIN_GEOMETRY_VERSION = 6

export const terrainMatchupIds = (dispositions: readonly string[]) => {
  const matchup = dispositions.length === 2 ? dispositions : []
  return matchup.length === 2 ? [...new Set([`${matchup[0]}-vs-${matchup[1]}`, `${matchup[1]}-vs-${matchup[0]}`])].toSorted() : []
}

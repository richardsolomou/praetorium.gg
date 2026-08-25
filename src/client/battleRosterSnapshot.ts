import type { Roster } from '../core/battle'
import type { BattleView } from '../core/battleView'

/**
 * The fielded list comes from the battle log, never from the mutable saved-list row.
 *
 * The view carries the frozen units once, as the player's `units`, so the complete
 * roster the snapshot page renders is put back together from the same player here.
 */
export function fieldedRoster(view: BattleView, rosterOrPlayerId: string): Roster | null {
  const player = view.players.find((candidate) => candidate.roster?.id === rosterOrPlayerId || candidate.id === rosterOrPlayerId)
  if (!player?.roster) return null
  return player.roster.built ? { ...player.roster, built: { ...player.roster.built, units: player.units } } : (player.roster as Roster)
}

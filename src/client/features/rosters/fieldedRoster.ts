import type { Roster } from '../../../core/battle'
import type { BattleView } from '../../../core/battleView'

/**
 * The fielded list comes from the battle log, never from the mutable saved-list row.
 *
 * The view carries the frozen units once, as the player's `units`, so the complete
 * roster the snapshot page renders is put back together from the same player here.
 */
export function fieldedRoster(view: BattleView, rosterOrPlayerId: string): Roster | null {
  const player = fieldingPlayer(view, rosterOrPlayerId)
  if (!player?.roster) return null
  return player.roster.built ? { ...player.roster, built: { ...player.roster.built, units: player.units } } : (player.roster as Roster)
}

/** The player who fielded a list, found by their id or, as older links name it, the saved roster's. */
export function fieldingPlayer(view: BattleView, rosterOrPlayerId: string) {
  return view.players.find((candidate) => candidate.roster?.id === rosterOrPlayerId || candidate.id === rosterOrPlayerId)
}

import type { BattleView } from '../core/battleView'

/** The fielded list comes from the battle log, never from the mutable saved-list row. */
export function fieldedRoster(view: BattleView, rosterId: string) {
  return view.players.find((player) => player.roster?.id === rosterId)?.roster ?? null
}

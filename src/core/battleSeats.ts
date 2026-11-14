import type { BattleSettings } from './battle'

export const PLAYERS_PER_BATTLE = 2
const TEAM_BATTLE_PLAYERS = 3

/**
 * How many players a battle seats.
 *
 * Its own settings decide it, and only here, so a third player following the link
 * is refused by the same rule the interface reads rather than by a separate one
 * that could come to disagree.
 */
export function battleCapacity(settings: { teamBattle?: boolean; playerCount?: 2 | 3 | 4; places?: readonly number[] }) {
  if (settings.places) return (settings.places[0]! + settings.places[1]!) as 2 | 3 | 4
  return settings.playerCount ?? (settings.teamBattle ? TEAM_BATTLE_PLAYERS : PLAYERS_PER_BATTLE)
}

/**
 * The places on each side nobody has joined yet, by side.
 *
 * Only a battle that counts its places has any: one whose seats were all filled at creation is full by definition.
 */
export function openPlaces(state: { settings: Pick<BattleSettings, 'places'>; players: readonly { side: number }[] }): [number, number] {
  const places = state.settings.places
  if (!places) return [0, 0]
  return [0, 1].map((side) => Math.max(0, places[side]! - state.players.filter((player) => player.side === side).length)) as [
    number,
    number,
  ]
}

/** A battle still being put together: a place is open or an army is missing. Only setup has drafts. */
export function stillFilling(state: {
  status: string
  settings: Pick<BattleSettings, 'places'>
  players: readonly { side: number; roster: unknown }[]
}) {
  return state.status === 'setup' && (openPlaces(state).some(Boolean) || state.players.some((player) => !player.roster))
}

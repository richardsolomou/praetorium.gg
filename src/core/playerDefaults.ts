import { DEFAULT_GAME_LIMIT, GAME_SIZES } from './battle'
import { ROSTER_VISIBILITIES, type RosterVisibility } from './savedRoster'

/** What a player's new rosters and battles start with; every one can still be changed where it is made. */
export type PlayerDefaults = { rosterVisibility: RosterVisibility; battleSize: number }

export const DEFAULT_PLAYER_DEFAULTS: PlayerDefaults = { rosterVisibility: 'private', battleSize: DEFAULT_GAME_LIMIT }

export const isPlayerDefaults = (value: { rosterVisibility: string; battleSize: number }): value is PlayerDefaults =>
  (ROSTER_VISIBILITIES as readonly string[]).includes(value.rosterVisibility) && GAME_SIZES.some((size) => size.limit === value.battleSize)

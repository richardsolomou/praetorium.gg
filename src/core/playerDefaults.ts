import { DEFAULT_GAME_LIMIT, isGameSize } from './battle'
import { ROSTER_VISIBILITIES, type RosterVisibility } from './savedRoster'

/** What a player's new rosters and battles start with; every one can still be changed where it is made. */
export type PlayerDefaults = { rosterVisibility: RosterVisibility; battleSize: number }

export const DEFAULT_PLAYER_DEFAULTS: PlayerDefaults = { rosterVisibility: 'public', battleSize: DEFAULT_GAME_LIMIT }

export const isPlayerDefaults = (value: { rosterVisibility: string; battleSize: number }): value is PlayerDefaults =>
  (ROSTER_VISIBILITIES as readonly string[]).includes(value.rosterVisibility) && isGameSize(value.battleSize)

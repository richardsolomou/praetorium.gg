import type { RosterPick } from './roster'

/** Every unit marked to keep the cheapest option of each choice it never made, as it was saved before a printed default won. */
export const flooredPicks = <T extends RosterPick>(picks: readonly T[]): T[] =>
  picks.map((pick) => (pick.floor ? pick : { ...pick, floor: true }))

import type { RosterPick } from './roster'

/** When choices started on the option the card prints; a unit saved before then keeps the cheapest, see `RosterPick.floor`. */
export const PRINTED_DEFAULTS_FROM = Date.UTC(2026, 10, 24)

/** These picks marked `floor` where the list was last saved before choices started on the printed default. */
export const flooredPicks = <T extends RosterPick>(picks: readonly T[], savedAt: number | undefined): T[] =>
  savedAt !== undefined && savedAt < PRINTED_DEFAULTS_FROM
    ? picks.map((pick) => (pick.floor ? pick : { ...pick, floor: true }))
    : [...picks]

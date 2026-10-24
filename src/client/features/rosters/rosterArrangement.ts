import { ROSTER_ARRANGEMENT_COOKIE } from '../../../contracts/rosterCookies'
import type { ShelfArrangement } from './builder/shelves'
import { setRosterCookie } from './rosterCookie'

const KEPT_FOR = 60 * 60 * 24 * 365

/** The arrangement a player last chose on this device, attached units together when the cookie is missing or invalid. */
export const keptRosterArrangement = (value: string | undefined): ShelfArrangement => (value === 'role' ? 'role' : 'attached')

/** Remembers the chosen arrangement on this device; the default needs no cookie. */
export function keepRosterArrangement(arrangement: ShelfArrangement) {
  setRosterCookie(ROSTER_ARRANGEMENT_COOKIE, arrangement === 'attached' ? null : arrangement, KEPT_FOR)
}

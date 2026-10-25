import { ROSTER_SORT_COOKIE } from '../../../contracts/rosterCookies'
import { setRosterCookie } from './rosterCookie'
import { ROSTER_SORTS, type RosterSort } from '../../../core/rosterSort'

/** The order a player last chose, or recently updated when the cookie is missing or invalid. */
export const keptRosterSort = (value: string | undefined): RosterSort =>
  ROSTER_SORTS.includes(value as RosterSort) ? (value as RosterSort) : 'updated-desc'

/** Remembers the chosen order on this device; the default needs no cookie. */
export function keepRosterSort(sort: RosterSort) {
  setRosterCookie(ROSTER_SORT_COOKIE, sort === 'updated-desc' ? null : sort)
}

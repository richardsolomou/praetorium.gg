import { ROSTER_GROUPING_COOKIE, ROSTER_SORT_COOKIE } from '../../../contracts/rosterCookies'
import { setRosterCookie } from './rosterCookie'
import { ROSTER_GROUPINGS, type RosterGrouping } from '../../../core/rosterGrouping'
import { ROSTER_SORTS, type RosterSort } from '../../../core/rosterSort'

/** The order a player last chose, or recently updated when the cookie is missing or invalid. */
export const keptRosterSort = (value: string | undefined): RosterSort =>
  ROSTER_SORTS.includes(value as RosterSort) ? (value as RosterSort) : 'updated-desc'

/** Remembers the chosen order on this device; the default needs no cookie. */
export function keepRosterSort(sort: RosterSort) {
  setRosterCookie(ROSTER_SORT_COOKIE, sort === 'updated-desc' ? null : sort)
}

/** What a player last grouped by, or no grouping when the cookie is missing or invalid. */
export const keptRosterGrouping = (value: string | undefined): RosterGrouping =>
  ROSTER_GROUPINGS.includes(value as RosterGrouping) ? (value as RosterGrouping) : 'none'

/** Remembers the chosen grouping on this device; no grouping needs no cookie. */
export function keepRosterGrouping(grouping: RosterGrouping) {
  setRosterCookie(ROSTER_GROUPING_COOKIE, grouping === 'none' ? null : grouping)
}

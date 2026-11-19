import { ROSTER_ARRANGEMENT_COOKIE, ROSTER_LAYOUT_COOKIE } from '../../../contracts/rosterCookies'
import type { ShelfArrangement } from './builder/shelves'
import { setRosterCookie } from './rosterCookie'

/** The arrangement a player last chose on this device, attached units together when the cookie is missing or invalid. */
export const keptRosterArrangement = (value: string | undefined): ShelfArrangement => (value === 'role' ? 'role' : 'attached')

/** Remembers the chosen arrangement on this device; the default needs no cookie. */
export function keepRosterArrangement(arrangement: ShelfArrangement) {
  setRosterCookie(ROSTER_ARRANGEMENT_COOKIE, arrangement === 'attached' ? null : arrangement)
}

/** Cards show each unit's loadout and links; a list gives each unit, or each attached unit, one line. */
export type RosterLayout = 'cards' | 'list'

export const keptRosterLayout = (value: string | undefined): RosterLayout => (value === 'list' ? 'list' : 'cards')

export function keepRosterLayout(layout: RosterLayout) {
  setRosterCookie(ROSTER_LAYOUT_COOKIE, layout === 'cards' ? null : layout)
}

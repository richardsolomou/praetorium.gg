import { ROSTER_SORT_COOKIE } from '../../../contracts/rosterCookies'
import { setRosterCookie } from './rosterCookie'

export const ROSTER_SORTS = [
  'created-desc',
  'created-asc',
  'name-asc',
  'name-desc',
  'updated-desc',
  'updated-asc',
  'size-asc',
  'size-desc',
] as const
export type RosterSort = (typeof ROSTER_SORTS)[number]

const KEPT_FOR = 60 * 60 * 24 * 365

/** The order a player last chose, or newest first when the cookie is missing or names no order. */
export const keptRosterSort = (value: string | undefined): RosterSort =>
  ROSTER_SORTS.includes(value as RosterSort) ? (value as RosterSort) : 'created-desc'

/** Remembers the chosen order on this device; newest first is the default and needs no cookie. */
export function keepRosterSort(sort: RosterSort) {
  setRosterCookie(ROSTER_SORT_COOKIE, sort === 'created-desc' ? null : sort, KEPT_FOR)
}

type SortableRoster = { id: string; name: string; limit: number; createdAt: number; updatedAt: number }

export function sortRosters<T extends SortableRoster>(rosters: readonly T[], sort: RosterSort): T[] {
  const name = (left: T, right: T) => left.name.localeCompare(right.name) || left.id.localeCompare(right.id)
  return rosters.toSorted((left, right) => {
    switch (sort) {
      case 'created-desc':
        return right.createdAt - left.createdAt || name(left, right)
      case 'created-asc':
        return left.createdAt - right.createdAt || name(left, right)
      case 'name-desc':
        return -name(left, right)
      case 'updated-desc':
        return right.updatedAt - left.updatedAt || name(left, right)
      case 'updated-asc':
        return left.updatedAt - right.updatedAt || name(left, right)
      case 'size-asc':
        return left.limit - right.limit || name(left, right)
      case 'size-desc':
        return right.limit - left.limit || name(left, right)
      default:
        return name(left, right)
    }
  })
}

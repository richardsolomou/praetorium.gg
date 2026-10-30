import { compareText } from './text'

export const ROSTER_SORTS = [
  'updated-desc',
  'updated-asc',
  'created-desc',
  'created-asc',
  'name-asc',
  'name-desc',
  'size-desc',
  'size-asc',
] as const
export type RosterSort = (typeof ROSTER_SORTS)[number]

type SortableRoster = { id: string; name: string; limit: number; createdAt: number; updatedAt: number }

/** Negative when `left` comes first in this order; every order ends on name and then ID, so no two rosters tie. */
export function compareRosters(sort: RosterSort) {
  const name = (left: SortableRoster, right: SortableRoster) => left.name.localeCompare(right.name) || compareText(left.id, right.id)
  return (left: SortableRoster, right: SortableRoster) => {
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
  }
}

export function sortRosters<T extends SortableRoster>(rosters: readonly T[], sort: RosterSort): T[] {
  return rosters.toSorted(compareRosters(sort))
}

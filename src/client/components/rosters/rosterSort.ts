export const ROSTER_SORTS = ['name-asc', 'name-desc', 'updated-desc', 'updated-asc', 'size-asc', 'size-desc'] as const
export type RosterSort = (typeof ROSTER_SORTS)[number]

type SortableRoster = { id: string; name: string; limit: number; updatedAt: number }

export function sortRosters<T extends SortableRoster>(rosters: readonly T[], sort: RosterSort): T[] {
  const name = (left: T, right: T) => left.name.localeCompare(right.name) || left.id.localeCompare(right.id)
  return rosters.toSorted((left, right) => {
    switch (sort) {
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

import { ADMIN_USER_PAGE_SIZES, ADMIN_USER_ROLES, ADMIN_USER_SORTS, type AdminUserSort } from '../../../admin'

export const DEFAULT_SORT: AdminUserSort = 'joined'
export const DEFAULT_PAGE_SIZE = 25

export type AdminTab = 'players' | 'photos'

/** The tab and the players table's search, filter, order and page; defaults stay out of the address. */
export type AdminSearch = {
  tab?: AdminTab
  q?: string
  /** Comma-separated roles, so a bookmark reads `role=admin` rather than an encoded array. */
  role?: string
  sort?: AdminUserSort
  /** Absent for the descending order every column starts with. */
  order?: 'asc'
  /** One-based, as a reader would count it. */
  page?: number
  size?: number
}

export function readAdminSearch(search: Record<string, unknown>): AdminSearch {
  const tab = search.tab === 'players' || search.tab === 'photos' ? search.tab : undefined
  // The router parses a numeric value such as `q=42` as a number.
  const q = typeof search.q === 'string' || typeof search.q === 'number' ? String(search.q).slice(0, 100) : ''
  const requested = typeof search.role === 'string' ? search.role.split(',') : []
  const role = ADMIN_USER_ROLES.filter((value) => requested.includes(value)).join(',')
  const sort = ADMIN_USER_SORTS.find((value) => value === search.sort && value !== DEFAULT_SORT)
  const page =
    typeof search.page === 'number' && Number.isInteger(search.page) && search.page > 1 && search.page <= 10_001 ? search.page : 0
  const size = ADMIN_USER_PAGE_SIZES.find((value) => value === search.size && value !== DEFAULT_PAGE_SIZE)
  return {
    ...(tab ? { tab } : {}),
    ...(q ? { q } : {}),
    ...(role ? { role } : {}),
    ...(sort ? { sort } : {}),
    ...(search.order === 'asc' ? { order: 'asc' as const } : {}),
    ...(page ? { page } : {}),
    ...(size ? { size } : {}),
  }
}

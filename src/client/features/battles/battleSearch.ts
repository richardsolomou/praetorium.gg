import { BATTLE_FILTER_FACETS, BATTLE_SEARCH_MAX_LENGTH, type BattleFacet, type BattleFilter } from '../../../core/battleFilter'
import type { FacetAddress, PeriodFilter } from '../../../core/listFilter'
import { facetSearch, facetsOf, periodSearch, searchText } from '../../searchParams'

/** Which whole list the page shows: Home lists the head of each, and links here for the rest. */
export type BattlesView = 'mine' | 'friends' | 'public'

export type BattleListSearch = PeriodFilter & { q?: string } & Partial<Record<BattleFacet, FacetAddress>>
export type BattlesSearch = BattleListSearch & { view?: Exclude<BattlesView, 'mine'> }

const VIEWS = ['friends', 'public'] as const

export function parseBattlesSearch(search: Record<string, unknown>): BattlesSearch {
  const view = VIEWS.find((known) => known === search.view)
  const q = searchText(search.q, BATTLE_SEARCH_MAX_LENGTH)?.trim()
  return { ...(view ? { view } : {}), ...(q ? { q } : {}), ...facetSearch(search, BATTLE_FILTER_FACETS), ...periodSearch(search) }
}

export function battleFilterOf({ q, period, from, to, ...search }: BattleListSearch): BattleFilter {
  return {
    ...(q ? { q } : {}),
    ...(period ? { period } : {}),
    ...(from ? { from } : {}),
    ...(to ? { to } : {}),
    ...facetsOf(search, BATTLE_FILTER_FACETS),
  }
}

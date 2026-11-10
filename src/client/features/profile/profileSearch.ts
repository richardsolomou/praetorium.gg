import type { BattleOrder } from '../../../core/battleFilter'
import type { FacetAddress } from '../../../core/listFilter'
import { ROSTER_SEARCH_MAX_LENGTH } from '../../../core/rosterDiscovery'
import { ROSTER_SORTS, type RosterSort } from '../../../core/rosterSort'
import type { PlayerProfileFilter } from '../../queries'
import { facetSearch, searchText } from '../../searchParams'
import { parseBattlesSearch, type BattleListSearch } from '../battles/battleSearch'

// Route search validation runs in the app's entry bundle, so this stays apart from the profile page.

const TABS = ['record', 'battles', 'rosters', 'collection', 'achievements'] as const
export type ProfileTab = (typeof TABS)[number]

export const PLAYER_ROSTER_FACETS = ['faction', 'detachment', 'size', 'points'] as const
export type PlayerRosterSearch = { q?: string; sort?: RosterSort } & Partial<Record<(typeof PLAYER_ROSTER_FACETS)[number], FacetAddress>>

export type BattlesTab = BattleListSearch & { tab: 'battles'; order?: BattleOrder }
export type RostersTab = PlayerRosterSearch & { tab: 'rosters' }
export type ProfileSearch = (PlayerProfileFilter & { tab?: Exclude<ProfileTab, 'battles' | 'rosters'> }) | BattlesTab | RostersTab

function parsePlayerRosterSearch(search: Record<string, unknown>): PlayerRosterSearch {
  const q = searchText(search.q, ROSTER_SEARCH_MAX_LENGTH)?.trim()
  const sort = ROSTER_SORTS.find((candidate) => candidate === search.sort)
  return { ...(q ? { q } : {}), ...(sort ? { sort } : {}), ...facetSearch(search, PLAYER_ROSTER_FACETS) }
}

/**
 * The address carries the tab and that tab's own narrowing, so the record's and the battle list's filters never share a key.
 *
 * `tab` is deliberately not a loader dependency: every tab's data is fetched for
 * the first frame, so switching one is a render rather than a request.
 */
export const readSearch = (search: Record<string, unknown>): ProfileSearch => {
  const size = Number(search.limit)
  const tab = TABS.find((candidate) => candidate === search.tab)
  if (tab === 'battles') {
    const { view: _view, ...battles } = parseBattlesSearch(search)
    return { tab, ...battles }
  }
  if (tab === 'rosters') return { tab, ...parsePlayerRosterSearch(search) }
  return {
    tab,
    faction: searchText(search.faction),
    detachment: searchText(search.detachment),
    opponentFaction: searchText(search.opponentFaction),
    opponentDetachment: searchText(search.opponentDetachment),
    opponentId: searchText(search.opponentId),
    missionPackId: searchText(search.missionPackId),
    limit: Number.isFinite(size) && size > 0 ? size : undefined,
  }
}

/** The record's narrowing alone, so a tab change is not a new cache key for the record. */
export const recordFilter = (search: ProfileSearch): PlayerProfileFilter => {
  if (search.tab === 'battles' || search.tab === 'rosters') return {}
  const { tab: _tab, ...filter } = search
  return filter
}

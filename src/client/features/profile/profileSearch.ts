import type { PlayerProfileFilter } from '../../queries'
import { searchText } from '../../searchParams'

// Route search validation runs in the app's entry bundle, so this stays apart from the profile page.

const TABS = ['record', 'battles', 'rosters', 'collection', 'achievements'] as const
export type ProfileTab = (typeof TABS)[number]

export type ProfileSearch = PlayerProfileFilter & { tab?: ProfileTab }

/**
 * The address carries both the tab and the record's narrowing.
 *
 * `tab` is deliberately not a loader dependency: every tab's data is fetched for
 * the first frame, so switching one is a render rather than a request.
 */
export const readSearch = (search: Record<string, unknown>): ProfileSearch => {
  const size = Number(search.limit)
  const tab = TABS.find((candidate) => candidate === search.tab)
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

/** The narrowing alone, so a tab change is not a new cache key for the record. */
export const recordFilter = ({ tab: _tab, ...filter }: ProfileSearch): PlayerProfileFilter => filter

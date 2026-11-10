import { createFileRoute } from '@tanstack/react-router'
import { keptRosterSort } from '../client/features/rosters/rosterSort'
import { GUEST_DRAFT_COOKIE, ROSTER_NOTICES_COOKIE, ROSTER_ROWS_COOKIE, ROSTER_SORT_COOKIE } from '../contracts/rosterCookies'
import { keptRosterRows } from '../client/features/rosters/rosterCookie'
import { requestCookie } from '../server/requestCookie'
import {
  discoveryFilter,
  DISCOVERY_FACETS,
  LIBRARY_FACETS,
  playedFilter,
  ROSTER_VIEWS,
  type RostersSearch,
} from '../client/features/rosters/rosterSearch'
import { RostersRoute } from '../client/features/rosters/RostersRoute'
import { ROSTER_SEARCH_MAX_LENGTH } from '../core/rosterDiscovery'
import { ROSTER_SORTS } from '../core/rosterSort'
import { discoveredRostersQuery, factionIndexQuery, meQuery, playedArmiesQuery } from '../client/queries'
import { pageHead } from '../client/linkPreview'
import { PageLoading } from '../client/components/PageState'
import { facetSearch, periodSearch, searchText } from '../client/searchParams'
import { rosterStartSearch } from '../client/features/rosters/rosterStart'

function rostersSearch(search: Record<string, unknown>): RostersSearch {
  const q = searchText(search.q, ROSTER_SEARCH_MAX_LENGTH)?.trim()
  const text = q ? { q } : {}
  const view = ROSTER_VIEWS.find((known) => known === search.view)
  if (view) {
    const sort = ROSTER_SORTS.find((known) => known !== 'updated-desc' && known === search.sort)
    return { view, ...text, ...facetSearch(search, DISCOVERY_FACETS), ...periodSearch(search), ...(sort ? { sort } : {}) }
  }
  return { ...text, ...facetSearch(search, LIBRARY_FACETS), ...periodSearch(search), ...rosterStartSearch(search) }
}

export const Route = createFileRoute('/rosters/')({
  pendingComponent: PageLoading,
  validateSearch: rostersSearch,
  // Keyed by the tab alone, so a filter change keeps the page and its list refetches in place instead of blocking navigation.
  loaderDeps: ({ search }) => ({ view: search.view }),
  loader: async ({ context, location }) => {
    const { view, sort, ...search } = rostersSearch(location.search)
    const me = await context.queryClient.query({ ...meQuery(), staleTime: 'static' })
    if (view) {
      const index = await context.queryClient.query({ ...factionIndexQuery(), staleTime: 'static' })
      const factions = index?.factions ?? []
      if (view === 'played')
        await context.queryClient.infiniteQuery({ ...playedArmiesQuery(playedFilter(search, factions)), staleTime: 'static' })
      else
        await context.queryClient.infiniteQuery({
          ...discoveredRostersQuery(discoveryFilter(search, factions), me ? view : 'public', sort ?? 'updated-desc'),
          staleTime: 'static',
        })
    }
    return {
      guestDraft: requestCookie(GUEST_DRAFT_COOKIE) === '1',
      sort: keptRosterSort(requestCookie(ROSTER_SORT_COOKIE)),
      notices: requestCookie(ROSTER_NOTICES_COOKIE) === '1',
      rows: keptRosterRows(requestCookie(ROSTER_ROWS_COOKIE)),
    }
  },
  head: ({ match }) =>
    pageHead(
      match.context.origin,
      match.search.view === 'played'
        ? {
            title: 'Played Warhammer 40,000 army lists',
            description:
              'Browse Warhammer 40,000 armies from finished public battles, filter them by faction, detachment and rules version, and copy one to edit.',
            path: '/rosters?view=played',
          }
        : match.search.view === 'public'
          ? {
              title: 'Public Warhammer 40,000 army lists',
              description:
                'Browse Warhammer 40,000 army lists other players published, filter them by faction, detachment and rules version, and duplicate one to edit.',
              path: '/rosters?view=public',
            }
          : {
              title: 'Warhammer 40,000 army builder',
              description:
                'Build free Warhammer 40,000 army lists, check points and legality, compare variants, and share, print or export your saved rosters.',
              path: '/rosters',
            },
    ),
  component: RosterLibraryRoute,
})

function RosterLibraryRoute() {
  const { guestDraft, sort, notices, rows } = Route.useLoaderData()
  return <RostersRoute search={Route.useSearch()} guestDraft={guestDraft} sort={sort} notices={notices} rows={rows} />
}

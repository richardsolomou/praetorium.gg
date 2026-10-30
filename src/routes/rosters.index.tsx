import { createFileRoute } from '@tanstack/react-router'
import { ROSTER_VISIBILITIES } from '../core/savedRoster'
import { GAME_SIZES } from '../core/battle'
import { keptRosterSort } from '../client/features/rosters/rosterSort'
import { ROSTER_UPDATE_FILTERS } from '../client/features/rosters/RosterFilters'
import { GUEST_DRAFT_COOKIE, ROSTER_SORT_COOKIE } from '../contracts/rosterCookies'
import { requestCookie } from '../server/requestCookie'
import { discoveryFilter } from '../client/features/rosters/RosterDiscoveryPage'
import { ROSTER_VIEWS, RostersRoute, type RostersSearch } from '../client/features/rosters/RostersRoute'
import { RULES_VERSION_STATUSES } from '../core/rosterDiscovery'
import { ROSTER_SORTS } from '../core/rosterSort'
import { discoveredRostersQuery, factionIndexQuery, meQuery, playedArmiesQuery } from '../client/queries'
import { pageHead } from '../client/linkPreview'
import { RosterLoading } from '../client/features/rosters/RosterLoading'
import { searchText } from '../client/searchParams'
import { rosterStartSearch } from '../client/features/rosters/rosterStart'

export const Route = createFileRoute('/rosters/')({
  pendingComponent: RosterLoading,
  validateSearch: (search: Record<string, unknown>): RostersSearch => {
    const limit = Number(search.limit)
    const faction = searchText(search.faction, 128)
    const view = ROSTER_VIEWS.find((known) => known === search.view)
    if (view) {
      const detachment = faction && searchText(search.detachment, 128)
      const rules = RULES_VERSION_STATUSES.find((status) => status === search.rules)
      const sort = ROSTER_SORTS.find((known) => known !== 'updated-desc' && known === search.sort)
      return {
        view,
        ...(faction ? { faction } : {}),
        ...(detachment ? { detachment } : {}),
        ...(rules ? { rules } : {}),
        ...(sort ? { sort } : {}),
      }
    }
    const visibility = ROSTER_VISIBILITIES.find((known) => known === search.visibility)
    const updates = ROSTER_UPDATE_FILTERS.find((known) => known === search.updates)
    return {
      ...(GAME_SIZES.some((size) => size.limit === limit) ? { limit } : {}),
      ...(faction ? { faction } : {}),
      ...(visibility ? { visibility } : {}),
      ...(updates ? { updates } : {}),
      ...rosterStartSearch(search),
    }
  },
  loaderDeps: ({ search: { view, faction, detachment, rules, sort } }) => ({ view, faction, detachment, rules, sort }),
  loader: async ({ context, deps: { view, sort, ...search } }) => {
    const me = await context.queryClient.query({ ...meQuery(), staleTime: 'static' })
    if (view) {
      const index = await context.queryClient.query({ ...factionIndexQuery(), staleTime: 'static' })
      const filter = discoveryFilter(search, index?.factions ?? [])
      if (view === 'played') await context.queryClient.infiniteQuery({ ...playedArmiesQuery(filter), staleTime: 'static' })
      else
        await context.queryClient.infiniteQuery({
          ...discoveredRostersQuery(filter, me ? view : 'public', sort ?? 'updated-desc'),
          staleTime: 'static',
        })
    }
    return { guestDraft: requestCookie(GUEST_DRAFT_COOKIE) === '1', sort: keptRosterSort(requestCookie(ROSTER_SORT_COOKIE)) }
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
  const { guestDraft, sort } = Route.useLoaderData()
  return <RostersRoute search={Route.useSearch()} guestDraft={guestDraft} sort={sort} />
}

import { createFileRoute } from '@tanstack/react-router'
import { ROSTER_VISIBILITIES, type RosterVisibility } from '../core/savedRoster'
import { GAME_SIZES } from '../core/battle'
import { keptRosterSort } from '../client/features/rosters/rosterSort'
import { ROSTER_UPDATE_FILTERS, type RosterUpdateFilter } from '../client/features/rosters/RosterFilters'
import { useQuery } from '@tanstack/react-query'
import { BuilderFrame, ClaimGuestRoster, useGuestDraft } from '../client/features/rosters/GuestRoster'
import { GUEST_DRAFT_COOKIE, ROSTER_SORT_COOKIE } from '../contracts/rosterCookies'
import { requestCookie } from '../server/requestCookie'
import { RosterLibraryPage, type RosterLibrarySearch } from '../client/features/rosters/RosterLibraryPage'
import { discoveryFilter, RosterDiscoveryPage, type RosterDiscoverySearch } from '../client/features/rosters/RosterDiscoveryPage'
import { RULES_VERSION_STATUSES, type RulesVersionStatus } from '../core/rosterDiscovery'
import { ROSTER_SORTS } from '../core/rosterSort'
import { discoveredRostersQuery, factionIndexQuery, meQuery, playedArmiesQuery } from '../client/queries'
import { pageHead } from '../client/linkPreview'
import { RosterLoading } from '../client/features/rosters/RosterLoading'
import { searchFlag, searchText } from '../client/searchParams'

const VIEWS = ['friends', 'public', 'played'] as const
type RosterView = (typeof VIEWS)[number]

export const Route = createFileRoute('/rosters/')({
  pendingComponent: RosterLoading,
  validateSearch: (search: Record<string, unknown>): RosterLibrarySearch & RosterDiscoverySearch & { view?: RosterView; new?: true } => {
    const limit = Number(search.limit)
    const faction = searchText(search.faction, 128)
    const view = VIEWS.find((known) => known === search.view)
    if (view) {
      const detachment = faction && searchText(search.detachment, 128)
      const rules = RULES_VERSION_STATUSES.find((status): status is RulesVersionStatus => status === search.rules)
      const sort = ROSTER_SORTS.find((known) => known !== 'updated-desc' && known === search.sort)
      return {
        view,
        ...(faction ? { faction } : {}),
        ...(detachment ? { detachment } : {}),
        ...(rules ? { rules } : {}),
        ...(sort ? { sort } : {}),
      }
    }
    const visibility =
      typeof search.visibility === 'string' && ROSTER_VISIBILITIES.includes(search.visibility as RosterVisibility)
        ? (search.visibility as RosterVisibility)
        : undefined
    return {
      ...(GAME_SIZES.some((size) => size.limit === limit) ? { limit } : {}),
      ...(faction ? { faction } : {}),
      ...(visibility ? { visibility } : {}),
      ...(ROSTER_UPDATE_FILTERS.includes(search.updates as RosterUpdateFilter) ? { updates: search.updates as RosterUpdateFilter } : {}),
      ...(searchFlag(search.new) ? { new: true as const } : {}),
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
    // Whether this browser holds a visitor's list, so the first frame holds its row or the claim it becomes.
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

/**
 * A player's library, or a visitor's one list on this device on the same page; either may instead ask for friends' or
 * public rosters. Signing up comes back here, and a player arriving with a visitor's list still on the device has it
 * saved first. `new` opens the setup for another roster, as `/rosters/new` asks.
 */
function RosterLibraryRoute() {
  const { view, detachment, rules, sort: listSort, new: starting, ...search } = Route.useSearch()
  const { guestDraft: hinted, sort } = Route.useLoaderData()
  const { data: me } = useQuery(meQuery())
  const [{ ready, guest }, setGuest] = useGuestDraft(hinted)
  if (view) return <RosterDiscoveryPage view={view} search={{ faction: search.faction, detachment, rules, sort: listSort }} />
  if (me && !ready && hinted) return <BuilderFrame />
  if (me && guest) return <ClaimGuestRoster key={guest.id} guest={guest} onDiscard={() => setGuest(null)} />
  return (
    <RosterLibraryPage
      search={search}
      sort={sort}
      starting={starting && ready}
      device={{ guest, pending: !ready && hinted, onChange: setGuest }}
    />
  )
}

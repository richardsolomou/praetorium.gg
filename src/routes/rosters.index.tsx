import { createFileRoute } from '@tanstack/react-router'
import { ROSTER_VISIBILITIES, type RosterVisibility } from '../core/savedRoster'
import { GAME_SIZES } from '../core/battle'
import { keptRosterSort } from '../client/features/rosters/rosterSort'
import { ROSTER_UPDATE_FILTERS, type RosterUpdateFilter } from '../client/features/rosters/RosterFilters'
import { useQuery } from '@tanstack/react-query'
import { useMemo } from 'react'
import { BuilderFrame, ClaimGuestRoster, GuestRoster, useGuestDraft } from '../client/features/rosters/GuestRoster'
import { GUEST_DRAFT_COOKIE, ROSTER_SORT_COOKIE } from '../contracts/rosterCookies'
import { requestCookie } from '../server/requestCookie'
import { RosterLibraryPage, type RosterLibrarySearch } from '../client/features/rosters/RosterLibraryPage'
import { discoveryFilter, RosterDiscoveryPage, type RosterDiscoverySearch } from '../client/features/rosters/RosterDiscoveryPage'
import { RULES_VERSION_STATUSES, type RulesVersionStatus } from '../core/rosterDiscovery'
import { discoveredRostersQuery, factionIndexQuery, meQuery, rostersLentToMeQuery } from '../client/queries'
import { pageHead } from '../client/linkPreview'
import { RosterLoading } from '../client/features/rosters/RosterLoading'

const VIEWS = ['friends', 'public'] as const
type RosterView = (typeof VIEWS)[number]

export const Route = createFileRoute('/rosters/')({
  pendingComponent: RosterLoading,
  validateSearch: (search: Record<string, unknown>): RosterLibrarySearch & RosterDiscoverySearch & { view?: RosterView; add?: string } => {
    const limit = Number(search.limit)
    const faction = typeof search.faction === 'string' && search.faction && search.faction.length <= 128 ? search.faction : undefined
    const view = VIEWS.find((known) => known === search.view)
    if (view) {
      const detachment = faction && typeof search.detachment === 'string' && search.detachment.length <= 128 ? search.detachment : undefined
      const rules = RULES_VERSION_STATUSES.find((status): status is RulesVersionStatus => status === search.rules)
      return { view, ...(faction ? { faction } : {}), ...(detachment ? { detachment } : {}), ...(rules ? { rules } : {}) }
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
      // A datasheet a reference page asked to add to a visitor's list, dropped once the builder has answered.
      ...(typeof search.add === 'string' && search.add && search.add.length <= 64 ? { add: search.add } : {}),
    }
  },
  loaderDeps: ({ search: { view, faction, detachment, rules } }) => ({ view, faction, detachment, rules }),
  loader: async ({ context, deps: { view, ...search } }) => {
    const me = await context.queryClient.query({ ...meQuery(), staleTime: 'static' })
    if (view) {
      const index = await context.queryClient.query({ ...factionIndexQuery(), staleTime: 'static' })
      await Promise.all([
        context.queryClient.infiniteQuery({
          ...discoveredRostersQuery(discoveryFilter(search, index?.factions ?? []), me ? view : 'public'),
          staleTime: 'static',
        }),
        me && view === 'friends' ? context.queryClient.query({ ...rostersLentToMeQuery(), staleTime: 'static' }) : null,
      ])
    }
    // A visitor's page is the roster setup, which offers every faction.
    else if (!me) await context.queryClient.query({ ...factionIndexQuery(), staleTime: 'static' })
    // Whether this browser holds a visitor's list, so the first frame is the builder or the claim it becomes.
    return { guestDraft: requestCookie(GUEST_DRAFT_COOKIE) === '1', sort: keptRosterSort(requestCookie(ROSTER_SORT_COOKIE)) }
  },
  head: ({ match }) =>
    pageHead(
      match.context.origin,
      match.search.view === 'public'
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
 * A player's library, or for a visitor the builder in its place; either may instead ask for
 * friends' or public rosters, and a visitor asking for friends' sees the public ones.
 *
 * A visitor has no lists to read, so the page they reach is the one they can use:
 * the builder, with the list kept on the device. Signing up comes back here, and a
 * player arriving with a visitor's list still on the device has it saved first.
 */
function RosterLibraryRoute() {
  const { add, view, detachment, rules, ...search } = Route.useSearch()
  const { guestDraft: hinted, sort } = Route.useLoaderData()
  const navigate = Route.useNavigate()
  const requested = useMemo(
    () =>
      add
        ? { entryId: add, onSettled: () => void navigate({ search: (current) => ({ ...current, add: undefined }), replace: true }) }
        : undefined,
    [add, navigate],
  )
  const { data: me } = useQuery(meQuery())
  const [{ ready, guest, revision }, setGuest] = useGuestDraft(hinted)
  if (view) return <RosterDiscoveryPage view={me ? view : 'public'} search={{ faction: search.faction, detachment, rules }} />
  if (!ready && hinted) return <BuilderFrame />
  if (me && guest) return <ClaimGuestRoster key={guest.id} guest={guest} onDiscard={() => setGuest(null)} />
  if (me) return <RosterLibraryPage search={search} sort={sort} />
  return <GuestRoster key={revision} guest={guest} requested={requested} onStart={setGuest} onDiscard={() => setGuest(null)} />
}

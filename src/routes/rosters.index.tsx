import { createFileRoute } from '@tanstack/react-router'
import { ROSTER_VISIBILITIES, type RosterVisibility } from '../core/savedRoster'
import { GAME_SIZES } from '../core/battle'
import { ROSTER_SORTS, type RosterSort } from '../client/features/rosters/rosterSort'
import { useQuery } from '@tanstack/react-query'
import { BuilderFrame, ClaimGuestRoster, GuestRoster, useGuestDraft } from '../client/features/rosters/GuestRoster'
import { guestDraftHint } from '../server/guestDraftHint'
import { RosterLibraryPage, type RosterLibrarySearch } from '../client/features/rosters/RosterLibraryPage'
import { factionIndexQuery, meQuery } from '../client/queries'

export const Route = createFileRoute('/rosters/')({
  validateSearch: (search: Record<string, unknown>): RosterLibrarySearch => {
    const limit = Number(search.limit)
    const faction = typeof search.faction === 'string' && search.faction.length <= 128 ? search.faction : undefined
    const visibility =
      typeof search.visibility === 'string' && ROSTER_VISIBILITIES.includes(search.visibility as RosterVisibility)
        ? (search.visibility as RosterVisibility)
        : undefined
    const sort =
      typeof search.sort === 'string' && ROSTER_SORTS.includes(search.sort as RosterSort) ? (search.sort as RosterSort) : undefined
    return {
      ...(GAME_SIZES.some((size) => size.limit === limit) ? { limit } : {}),
      ...(faction ? { faction } : {}),
      ...(visibility ? { visibility } : {}),
      ...(sort && sort !== 'created-desc' ? { sort } : {}),
    }
  },
  loader: async ({ context }) => {
    const me = await context.queryClient.query({ ...meQuery(), staleTime: 'static' })
    // A visitor's page is the roster setup, which offers every faction.
    if (!me) await context.queryClient.query({ ...factionIndexQuery(), staleTime: 'static' })
    // Whether this tab holds a visitor's list, so the first frame is the builder or the claim it becomes.
    return { guestDraft: guestDraftHint() }
  },
  component: RosterLibraryRoute,
})

/**
 * A player's library, or for a visitor the builder in its place.
 *
 * A visitor has no lists to read, so the page they reach is the one they can use:
 * the builder, with the list kept in the tab. Signing up comes back here, and a
 * player arriving with a visitor's list still in the tab has it saved first.
 */
function RosterLibraryRoute() {
  const search = Route.useSearch()
  const { guestDraft: hinted } = Route.useLoaderData()
  const { data: me } = useQuery(meQuery())
  const [{ ready, guest }, setGuest] = useGuestDraft(hinted)
  if (!ready && hinted) return <BuilderFrame />
  if (me && guest) return <ClaimGuestRoster guest={guest} onDiscard={() => setGuest(null)} />
  if (me) return <RosterLibraryPage search={search} />
  return <GuestRoster guest={guest} onStart={setGuest} onDiscard={() => setGuest(null)} />
}

import { createFileRoute, useNavigate, useRouter } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { ClaimGuestRoster, GuestRoster, useGuestDraft } from '../client/features/rosters/GuestRoster'
import { meQuery } from '../client/queries'
import { useEffect } from 'react'
import { RosterPage } from '../client/features/rosters/RosterPage'
import { pageHead, previewImage } from '../client/linkPreview'
import { loadRoster } from '../client/features/rosters/rosterRouteData'
import { RosterLoading } from '../client/features/rosters/RosterLoading'
import { requestedDatasheetSearch, useRequestedDatasheet } from '../client/features/rosters/requestedDatasheet'
import { searchFlag, searchText } from '../client/searchParams'
import { keptRosterArrangement } from '../client/features/rosters/rosterArrangement'
import { ROSTER_ARRANGEMENT_COOKIE } from '../contracts/rosterCookies'
import { requestCookie } from '../server/requestCookie'

export const Route = createFileRoute('/rosters/$id/')({
  pendingComponent: RosterLoading,
  // A battle token is what lets an entitled battle reader open a list that is otherwise private.
  validateSearch: (
    search: Record<string, unknown>,
  ): { battle?: string; league?: string; event?: string; print?: boolean; add?: string } => ({
    battle: searchText(search.battle),
    ...requestedDatasheetSearch(search),
    league: searchText(search.league),
    event: searchText(search.event),
    ...(searchFlag(search.print) ? { print: true } : {}),
  }),
  loaderDeps: ({ search }) => ({ battle: search.battle, league: search.league, event: search.event }),
  loader: async ({ context, params, deps, preload }) => ({
    ...(await loadRoster(context.queryClient, params.id, deps, preload)),
    // Read by the server too, so the first frame is already arranged the way the player left it.
    arrangement: keptRosterArrangement(requestCookie(ROSTER_ARRANGEMENT_COOKIE)),
  }),
  head: ({ loaderData, match, params }) => {
    const preview = loaderData?.preview
    const exposure = loaderData?.exposure
    if (!preview || !exposure)
      return loaderData?.snapshot || loaderData?.onDevice || loaderData?.guestDraft
        ? { meta: [{ name: 'robots', content: 'noindex' }] }
        : {}
    const path = `/rosters/${params.id}`
    return pageHead(match.context.origin, {
      title: preview.title,
      description: preview.description,
      path,
      ...(exposure.image ? { image: previewImage(path, preview.title) } : {}),
      noindex: exposure.noindex,
    })
  },
  component: RosterRoute,
})

function RosterRoute() {
  const { id } = Route.useParams()
  const { battle, league, event, print, add } = Route.useSearch()
  const { editable, snapshot, league: leagueSnapshot, onDevice, guestDraft } = Route.useLoaderData()
  const requested = useRequestedDatasheet(add)
  if (guestDraft) return <GuestDraftRoster print={print} requested={requested} />
  if (onDevice) return <DeviceRoster />
  return (
    <RosterPage
      id={id}
      battle={battle}
      league={league}
      event={event}
      print={print}
      editable={editable}
      snapshot={snapshot}
      leagueSnapshot={leagueSnapshot}
      requested={requested}
    />
  )
}

function DeviceRoster() {
  const router = useRouter()
  useEffect(() => {
    void router.invalidate({ filter: (match) => match.routeId === Route.id })
  }, [router])
  return <RosterLoading />
}

/** A visitor's one list, built here; once they sign in, it is saved to the account under this same address. */
function GuestDraftRoster({ print, requested }: { print?: boolean; requested?: ReturnType<typeof useRequestedDatasheet> }) {
  const navigate = useNavigate()
  const { data: me } = useQuery(meQuery())
  const [{ guest, revision }, setGuest] = useGuestDraft(true)
  // Discarded here or in another tab, the list is gone, so the rosters page is where the visitor goes.
  useEffect(() => {
    if (!guest) void navigate({ to: '/rosters', replace: true })
  }, [guest, navigate])
  if (!guest) return <RosterLoading />
  if (me) return <ClaimGuestRoster key={guest.id} guest={guest} onDiscard={() => setGuest(null)} />
  return <GuestRoster key={revision} guest={guest} print={print} requested={requested} onDiscard={() => setGuest(null)} />
}

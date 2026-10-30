import { createFileRoute } from '@tanstack/react-router'
import { DeviceRoster, GuestDraftRoster } from '../client/features/rosters/RosterRouteViews'
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

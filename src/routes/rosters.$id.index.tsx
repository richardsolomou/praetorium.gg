import { createFileRoute, useRouter } from '@tanstack/react-router'
import { useEffect } from 'react'
import { RosterPage } from '../client/features/rosters/RosterPage'
import { pageHead, previewImage } from '../client/linkPreview'
import { loadRoster } from '../client/features/rosters/rosterRouteData'
import { RosterLoading } from '../client/features/rosters/RosterLoading'
import { requestedDatasheetSearch, useRequestedDatasheet } from '../client/features/rosters/requestedDatasheet'
import { searchFlag } from '../client/searchParams'

export const Route = createFileRoute('/rosters/$id/')({
  pendingComponent: RosterLoading,
  // A battle token is what lets an entitled battle reader open a list that is otherwise private.
  validateSearch: (
    search: Record<string, unknown>,
  ): { battle?: string; league?: string; event?: string; print?: boolean; add?: string } => ({
    ...(typeof search.battle === 'string' ? { battle: search.battle } : {}),
    ...requestedDatasheetSearch(search),
    ...(typeof search.league === 'string' ? { league: search.league } : {}),
    ...(typeof search.event === 'string' ? { event: search.event } : {}),
    ...(searchFlag(search.print) ? { print: true } : {}),
  }),
  loaderDeps: ({ search }) => ({ battle: search.battle, league: search.league, event: search.event }),
  loader: ({ context, params, deps }) => loadRoster(context.queryClient, params.id, deps),
  head: ({ loaderData, match, params }) => {
    const preview = loaderData?.preview
    const exposure = loaderData?.exposure
    if (!preview || !exposure) return loaderData?.snapshot || loaderData?.onDevice ? { meta: [{ name: 'robots', content: 'noindex' }] } : {}
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
  const { editable, snapshot, league: leagueSnapshot, onDevice } = Route.useLoaderData()
  const requested = useRequestedDatasheet(add)
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

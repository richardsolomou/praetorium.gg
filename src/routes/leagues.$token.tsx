import { createFileRoute, notFound } from '@tanstack/react-router'
import { LeaguePage, type LeagueTab } from '../client/features/leagues/LeaguePage'
import { leagueQuery } from '../client/queries'

export const Route = createFileRoute('/leagues/$token')({
  validateSearch: (search: Record<string, unknown>): { event?: string; view?: LeagueTab; start?: boolean; choose?: boolean } => ({
    ...(typeof search.event === 'string' ? { event: search.event } : {}),
    ...(search.view === 'event' || search.view === 'organize' ? { view: search.view } : {}),
    ...(search.start === true || search.start === 'true' ? { start: true } : {}),
    ...(search.choose === true || search.choose === 'true' ? { choose: true } : {}),
  }),
  loaderDeps: ({ search }) => ({ event: search.event }),
  loader: async ({ context, params, deps }) => {
    const league = await context.queryClient.query({ ...leagueQuery(params.token, deps.event), staleTime: 'static' })
    if (!league) throw notFound()
  },
  component: LeagueRoute,
})

function LeagueRoute() {
  const { token } = Route.useParams()
  const { event, view, start, choose } = Route.useSearch()
  return <LeaguePage key={event ?? ''} token={token} eventToken={event} view={view} startBattle={start} chooseRoster={choose} />
}

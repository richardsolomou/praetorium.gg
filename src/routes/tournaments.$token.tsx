import { createFileRoute, notFound, redirect } from '@tanstack/react-router'
import { LeaguePage } from '../client/features/leagues/LeaguePage'
import { deploymentsQuery, leagueQuery } from '../client/queries'
import { searchFlag } from '../client/searchParams'

export const Route = createFileRoute('/tournaments/$token')({
  validateSearch: (search: Record<string, unknown>): { event?: string; start?: boolean; choose?: boolean } => ({
    ...(typeof search.event === 'string' ? { event: search.event } : {}),
    ...(searchFlag(search.start) ? { start: true } : {}),
    ...(searchFlag(search.choose) ? { choose: true } : {}),
  }),
  loaderDeps: ({ search }) => ({ event: search.event }),
  loader: async ({ context, params, deps, location }) => {
    const [league] = await Promise.all([
      context.queryClient.query({ ...leagueQuery(params.token, deps.event), staleTime: 'static' }),
      context.queryClient.query({ ...deploymentsQuery(), staleTime: 'static' }).catch(() => null),
    ])
    if (!league) throw notFound()
    // A club's sealed game lives under its club, so a tournament link to one goes there.
    if (league.club)
      throw redirect({
        to: '/clubs/$token/games/$game',
        params: { token: league.club.token, game: params.token },
        search: location.search,
        replace: true,
      })
  },
  component: LeagueRoute,
})

function LeagueRoute() {
  const { token } = Route.useParams()
  const { event, start, choose } = Route.useSearch()
  return <LeaguePage key={event ?? ''} token={token} eventToken={event} startBattle={start} chooseRoster={choose} />
}

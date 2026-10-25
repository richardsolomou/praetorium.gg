import { createFileRoute, notFound, redirect } from '@tanstack/react-router'
import { LeaguePage } from '../client/features/leagues/LeaguePage'
import { deploymentsQuery, leagueQuery } from '../client/queries'
import { searchFlag } from '../client/searchParams'

/** A club's sealed game: the same page a tournament has, under the club it belongs to. */
export const Route = createFileRoute('/clubs/$token_/games/$game')({
  validateSearch: (search: Record<string, unknown>): { event?: string; start?: boolean; choose?: boolean } => ({
    ...(typeof search.event === 'string' ? { event: search.event } : {}),
    ...(searchFlag(search.start) ? { start: true } : {}),
    ...(searchFlag(search.choose) ? { choose: true } : {}),
  }),
  loaderDeps: ({ search }) => ({ event: search.event }),
  loader: async ({ context, params, deps, location }) => {
    const [league] = await Promise.all([
      context.queryClient.query({ ...leagueQuery(params.game, deps.event), staleTime: 'static' }),
      context.queryClient.query({ ...deploymentsQuery(), staleTime: 'static' }).catch(() => null),
    ])
    if (!league) throw notFound()
    if (league.club?.token !== params.token)
      throw league.club
        ? redirect({ to: '/clubs/$token/games/$game', params: { token: league.club.token, game: params.game }, search: location.search })
        : redirect({ to: '/tournaments/$token', params: { token: params.game }, search: location.search })
  },
  component: SealedGameRoute,
})

function SealedGameRoute() {
  const { game } = Route.useParams()
  const { event, start, choose } = Route.useSearch()
  return <LeaguePage key={event ?? ''} token={game} eventToken={event} startBattle={start} chooseRoster={choose} />
}

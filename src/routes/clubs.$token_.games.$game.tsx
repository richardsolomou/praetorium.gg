import { createFileRoute, notFound, redirect } from '@tanstack/react-router'
import { LeaguePage } from '../client/features/leagues/LeaguePage'
import { deploymentsQuery, leagueQuery } from '../client/queries'
import { searchFlag } from '../client/searchParams'

/** A club's sealed game, addressed by its event's token: the same page a tournament has, under the club it belongs to. */
export const Route = createFileRoute('/clubs/$token_/games/$game')({
  validateSearch: (search: Record<string, unknown>): { start?: boolean; choose?: boolean } => ({
    ...(searchFlag(search.start) ? { start: true } : {}),
    ...(searchFlag(search.choose) ? { choose: true } : {}),
  }),
  loader: async ({ context, params, location }) => {
    const [league] = await Promise.all([
      context.queryClient.query({ ...leagueQuery(params.game), staleTime: 'static' }),
      context.queryClient.query({ ...deploymentsQuery(), staleTime: 'static' }).catch(() => null),
    ])
    if (!league) throw notFound()
    if (!league.club) throw redirect({ to: '/tournaments/$token', params: { token: league.token }, search: location.search, replace: true })
    if (league.club.token !== params.token)
      throw redirect({
        to: '/clubs/$token/games/$game',
        params: { token: league.club.token, game: league.token },
        search: location.search,
        replace: true,
      })
  },
  component: SealedGameRoute,
})

function SealedGameRoute() {
  const { game } = Route.useParams()
  const { start, choose } = Route.useSearch()
  return <LeaguePage token={game} startBattle={start} chooseRoster={choose} />
}

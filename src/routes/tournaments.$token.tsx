import { createFileRoute, notFound, redirect } from '@tanstack/react-router'
import { LeaguePage } from '../client/features/leagues/LeaguePage'
import { eventAddress } from '../client/functions'
import { deploymentsQuery, leagueQuery } from '../client/queries'
import { searchFlag, searchText } from '../client/searchParams'

export const Route = createFileRoute('/tournaments/$token')({
  validateSearch: (search: Record<string, unknown>): { event?: string; start?: boolean; choose?: boolean } => ({
    event: searchText(search.event),
    ...(searchFlag(search.start) ? { start: true } : {}),
    ...(searchFlag(search.choose) ? { choose: true } : {}),
  }),
  loaderDeps: ({ search }) => ({ event: search.event }),
  loader: async ({ context, params, deps, location }) => {
    const [league] = await Promise.all([
      deps.event ? null : context.queryClient.query({ ...leagueQuery(params.token), staleTime: 'static' }),
      context.queryClient.query({ ...deploymentsQuery(), staleTime: 'static' }).catch(() => null),
    ])
    if (league?.kind === 'tournament' && league.token === params.token) return
    // Anything else is a link from elsewhere: an old league's, now its club's, a club game's, or one naming its event.
    const address = await eventAddress({ data: { token: params.token, eventToken: deps.event } })
    const { event: _event, ...search } = location.search as { event?: string; start?: boolean; choose?: boolean }
    if (address?.kind === 'tournament')
      throw redirect({ to: '/tournaments/$token', params: { token: address.token }, search, replace: true })
    if (address?.kind === 'club-game')
      throw redirect({ to: '/clubs/$token/games/$game', params: { token: address.clubToken, game: address.token }, search, replace: true })
    if (address?.kind === 'club') throw redirect({ to: '/clubs/$token', params: { token: address.clubToken }, replace: true })
    throw notFound()
  },
  component: LeagueRoute,
})

function LeagueRoute() {
  const { token } = Route.useParams()
  const { start, choose } = Route.useSearch()
  return <LeaguePage token={token} startBattle={start} chooseRoster={choose} />
}

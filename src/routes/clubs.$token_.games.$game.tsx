import { createFileRoute, notFound, redirect } from '@tanstack/react-router'
import { leagueQuery } from '../client/queries'

/** A club's sealed game is played on its club's page, so its own address, used by links and notifications, opens it there. */
export const Route = createFileRoute('/clubs/$token_/games/$game')({
  loader: async ({ context, params }) => {
    const league = await context.queryClient.query({ ...leagueQuery(params.game), staleTime: 'static' })
    if (!league) throw notFound()
    if (!league.club) throw redirect({ to: '/tournaments/$token', params: { token: league.token }, replace: true })
    throw redirect({
      to: '/clubs/$token',
      params: { token: league.club.token },
      search: { game: league.token },
      hash: `game-${league.token}`,
      replace: true,
    })
  },
})

import { createFileRoute } from '@tanstack/react-router'
import { LeaderboardPage } from '../client/features/leaderboard/LeaderboardPage'
import { pageMeta } from '../client/linkPreview'
import { standingsQuery } from '../client/queries'

export const Route = createFileRoute('/leaderboard')({
  validateSearch: (search: Record<string, unknown>) => ({
    faction: typeof search.faction === 'string' && search.faction ? search.faction : undefined,
  }),
  loader: ({ context }) => context.queryClient.query({ ...standingsQuery(), staleTime: 'static' }),
  head: ({ match }) => ({
    meta: pageMeta(match.context.origin, {
      title: 'Leaderboard',
      description: 'Who is winning: players ranked by wins and win rate over recent public Warhammer 40,000 battles.',
      path: '/leaderboard',
    }),
  }),
  component: LeaderboardRoute,
})

function LeaderboardRoute() {
  return <LeaderboardPage faction={Route.useSearch().faction} />
}

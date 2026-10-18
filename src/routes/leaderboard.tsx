import { createFileRoute } from '@tanstack/react-router'
import { LeaderboardPage } from '../client/features/leaderboard/LeaderboardPage'
import { pageHead } from '../client/linkPreview'
import { standingsQuery } from '../client/queries'
import { searchText } from '../client/searchParams'

export const Route = createFileRoute('/leaderboard')({
  validateSearch: (search: Record<string, unknown>) => ({
    faction: searchText(search.faction),
  }),
  loader: ({ context }) => context.queryClient.query({ ...standingsQuery(), staleTime: 'static' }),
  head: ({ match }) =>
    pageHead(match.context.origin, {
      title: 'Leaderboard',
      description: 'Who is winning: players ranked by rating over recent public Warhammer 40,000 battles.',
      path: '/leaderboard',
    }),
  component: LeaderboardRoute,
})

function LeaderboardRoute() {
  return <LeaderboardPage faction={Route.useSearch().faction} />
}

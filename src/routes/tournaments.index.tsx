import { createFileRoute } from '@tanstack/react-router'
import { LeagueIndex } from '../client/features/leagues/LeagueIndex'
import { pageHead } from '../client/linkPreview'
import { leaguesQuery } from '../client/queries'

export const Route = createFileRoute('/tournaments/')({
  loader: ({ context }) => context.queryClient.query({ ...leaguesQuery(), staleTime: 'static' }),
  head: ({ match }) =>
    pageHead(match.context.origin, {
      title: 'Tournaments',
      description: 'Collect sealed rosters for an event, then reveal every accepted list together.',
      path: '/tournaments',
    }),
  component: LeagueIndex,
})

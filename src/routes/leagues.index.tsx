import { createFileRoute } from '@tanstack/react-router'
import { LeagueIndex } from '../client/features/leagues/LeagueIndex'
import { pageMeta } from '../client/linkPreview'
import { leaguesQuery } from '../client/queries'

export const Route = createFileRoute('/leagues/')({
  loader: ({ context }) => context.queryClient.query({ ...leaguesQuery(), staleTime: 'static' }),
  head: ({ match }) => ({
    meta: pageMeta(match.context.origin, {
      title: 'Leagues',
      description: 'Collect sealed rosters for a league, tournament, or private event, then reveal every accepted list together.',
      path: '/leagues',
    }),
  }),
  component: LeagueIndex,
})

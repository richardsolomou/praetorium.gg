import { createFileRoute } from '@tanstack/react-router'
import { LeagueIndex } from '../client/features/leagues/LeagueIndex'
import { leaguesQuery } from '../client/queries'

export const Route = createFileRoute('/leagues/')({
  loader: ({ context }) => context.queryClient.query({ ...leaguesQuery(), staleTime: 'static' }),
  component: LeagueIndex,
})

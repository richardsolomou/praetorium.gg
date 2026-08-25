import { createFileRoute } from '@tanstack/react-router'
import { LeagueIndex } from '../client/components/leagues/LeagueIndex'
import { leaguesQuery } from '../client/queries'

export const Route = createFileRoute('/leagues/')({
  loader: ({ context }) => context.queryClient.ensureQueryData(leaguesQuery()),
  component: LeagueIndex,
})

import { createFileRoute, notFound } from '@tanstack/react-router'
import { LeaguePage } from '../client/components/leagues/LeaguePage'
import { factionsQuery, leagueQuery, savedRosterPointsQuery, savedRostersQuery } from '../client/queries'

export const Route = createFileRoute('/leagues/$token')({
  loader: async ({ context, params }) => {
    const [league] = await Promise.all([
      context.queryClient.ensureQueryData(leagueQuery(params.token)),
      context.queryClient.ensureQueryData(savedRostersQuery()),
      context.queryClient.ensureQueryData(savedRosterPointsQuery()),
      context.queryClient.ensureQueryData(factionsQuery()),
    ])
    if (!league) throw notFound()
  },
  component: LeagueRoute,
})

function LeagueRoute() {
  const { token } = Route.useParams()
  return <LeaguePage token={token} />
}

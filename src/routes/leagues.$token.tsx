import { createFileRoute, notFound } from '@tanstack/react-router'
import { LeaguePage } from '../client/components/leagues/LeaguePage'
import { factionsQuery, leagueQuery, savedRosterPointsQuery, savedRosterSummariesQuery } from '../client/queries'

export const Route = createFileRoute('/leagues/$token')({
  validateSearch: (search: Record<string, unknown>): { event?: string } =>
    typeof search.event === 'string' ? { event: search.event } : {},
  loaderDeps: ({ search }) => ({ event: search.event }),
  loader: async ({ context, params, deps }) => {
    const [league] = await Promise.all([
      context.queryClient.ensureQueryData(leagueQuery(params.token, deps.event)),
      context.queryClient.ensureQueryData(savedRosterSummariesQuery()),
      context.queryClient.ensureQueryData(savedRosterPointsQuery()),
      context.queryClient.ensureQueryData(factionsQuery()),
    ])
    if (!league) throw notFound()
  },
  component: LeagueRoute,
})

function LeagueRoute() {
  const { token } = Route.useParams()
  const { event } = Route.useSearch()
  return <LeaguePage token={token} eventToken={event} />
}

import { createFileRoute, notFound } from '@tanstack/react-router'
import { LeaguePage } from '../client/components/leagues/LeaguePage'
import { leagueQuery } from '../client/queries'

export const Route = createFileRoute('/leagues/$token')({
  validateSearch: (search: Record<string, unknown>): { event?: string; start?: boolean } => ({
    ...(typeof search.event === 'string' ? { event: search.event } : {}),
    ...(search.start === true || search.start === 'true' ? { start: true } : {}),
  }),
  loaderDeps: ({ search }) => ({ event: search.event }),
  loader: async ({ context, params, deps }) => {
    const league = await context.queryClient.ensureQueryData(leagueQuery(params.token, deps.event))
    if (!league) throw notFound()
  },
  component: LeagueRoute,
})

function LeagueRoute() {
  const { token } = Route.useParams()
  const { event, start } = Route.useSearch()
  return <LeaguePage key={event ?? ''} token={token} eventToken={event} startBattle={start} />
}

import { createFileRoute, notFound } from '@tanstack/react-router'
import { ClubPage } from '../client/features/clubs/ClubPage'
import { clubQuery, clubStandingsQuery, deploymentsQuery } from '../client/queries'

export const Route = createFileRoute('/clubs/$token')({
  // The games and the table are read with the club, so the page arrives whole rather than filling in and shifting.
  loader: async ({ context, params }) => {
    const [club] = await Promise.all([
      context.queryClient.query({ ...clubQuery(params.token), staleTime: 'static' }),
      context.queryClient.query({ ...clubStandingsQuery(params.token), staleTime: 'static' }).catch(() => null),
      context.queryClient.query({ ...deploymentsQuery(), staleTime: 'static' }).catch(() => null),
    ])
    if (!club) throw notFound()
  },
  component: ClubRoute,
})

function ClubRoute() {
  return <ClubPage token={Route.useParams().token} />
}

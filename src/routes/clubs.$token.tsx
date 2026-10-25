import { createFileRoute, notFound } from '@tanstack/react-router'
import { ClubPage } from '../client/features/clubs/ClubPage'
import { clubQuery } from '../client/queries'

export const Route = createFileRoute('/clubs/$token')({
  loader: async ({ context, params }) => {
    const club = await context.queryClient.query({ ...clubQuery(params.token), staleTime: 'static' })
    if (!club) throw notFound()
  },
  component: ClubRoute,
})

function ClubRoute() {
  return <ClubPage token={Route.useParams().token} />
}

import { createFileRoute, notFound } from '@tanstack/react-router'
import { MissionPackPage } from '../client/features/reference/missions/MissionPackPage'
import { gameReferencesQuery } from '../client/queries'
import { pageHead } from '../client/linkPreview'

export const Route = createFileRoute('/missions/$packId')({
  loader: async ({ context, params }) => {
    const data = await context.queryClient.query({ ...gameReferencesQuery(), staleTime: 'static' })
    const pack = data?.packs.find((candidate) => candidate.id === params.packId)
    if (!pack) throw notFound()
    return { name: pack.name }
  },
  head: ({ loaderData, match, params }) =>
    loaderData
      ? pageHead(match.context.origin, {
          title: `${loaderData.name} missions`,
          description: `${loaderData.name} Force Disposition matchups, primary missions, and scoring.`,
          path: `/missions/${params.packId}`,
          article: true,
        })
      : {},
  component: () => <MissionPackPage packId={Route.useParams().packId} />,
})

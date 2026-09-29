import { createFileRoute, notFound } from '@tanstack/react-router'
import { MissionPackPage } from '../client/features/reference/missions/MissionPackPage'
import { gameReferencesQuery } from '../client/queries'
import { canonicalLink } from '../client/linkPreview'

export const Route = createFileRoute('/missions/$packId')({
  loader: async ({ context, params }) => {
    const data = await context.queryClient.query({ ...gameReferencesQuery(), staleTime: 'static' })
    const pack = data?.packs.find((candidate) => candidate.id === params.packId)
    if (!pack) throw notFound()
    return { name: pack.name }
  },
  head: ({ loaderData, match, params }) => ({
    meta: loaderData
      ? [
          { title: `${loaderData.name} missions — Praetorium` },
          { name: 'description', content: `${loaderData.name} Force Disposition matchups, primary missions, and scoring.` },
          { property: 'og:title', content: `${loaderData.name} missions` },
          { property: 'og:description', content: `${loaderData.name} Force Disposition matchups, primary missions, and scoring.` },
          { property: 'og:type', content: 'article' },
        ]
      : [],
    links: loaderData ? [canonicalLink(match.context.origin, `/missions/${params.packId}`)] : [],
  }),
  component: () => <MissionPackPage packId={Route.useParams().packId} />,
})

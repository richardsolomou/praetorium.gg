import { createFileRoute, notFound } from '@tanstack/react-router'
import { SecondaryMissionPage } from '../client/features/reference/missions/SecondaryMissionPage'
import { gameReferencesQuery } from '../client/queries'

export const Route = createFileRoute('/mission-packs/$packId_/secondary-missions/$cardId')({
  loader: async ({ context, params }) => {
    const data = await context.queryClient.query({ ...gameReferencesQuery(), staleTime: 'static' })
    const pack = data?.packs.find((candidate) => candidate.id === params.packId)
    const card = data?.secondaries.find((candidate) => candidate.key === params.cardId)
    if (!pack || !card) throw notFound()
    return { pack: pack.name, card: card.name }
  },
  head: ({ loaderData, params }) => ({
    meta: loaderData
      ? [
          { title: `${loaderData.card} — ${loaderData.pack} — Praetorium` },
          { name: 'description', content: `${loaderData.card} secondary mission scoring, timing, and actions.` },
          { property: 'og:title', content: loaderData.card },
          { property: 'og:description', content: `${loaderData.card} secondary mission scoring, timing, and actions.` },
          { property: 'og:type', content: 'article' },
        ]
      : [],
    links: loaderData ? [{ rel: 'canonical', href: `/mission-packs/${params.packId}/secondary-missions/${params.cardId}` }] : [],
  }),
  component: () => <SecondaryMissionPage {...Route.useParams()} />,
})

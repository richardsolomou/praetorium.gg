import { createFileRoute, notFound } from '@tanstack/react-router'
import { SecondaryMissionPage } from '../client/features/reference/missions/SecondaryMissionPage'
import { gameReferencesQuery } from '../client/queries'
import { breadcrumbMeta, canonicalLink } from '../client/linkPreview'

export const Route = createFileRoute('/mission-packs/$packId_/secondary-missions/$cardId')({
  loader: async ({ context, params }) => {
    const data = await context.queryClient.query({ ...gameReferencesQuery(), staleTime: 'static' })
    const pack = data?.packs.find((candidate) => candidate.id === params.packId)
    const card = data?.secondaries.find((candidate) => candidate.key === params.cardId)
    if (!pack || !card) throw notFound()
    return { pack: pack.name, card: card.name }
  },
  head: ({ loaderData, match, params }) => ({
    meta: loaderData
      ? [
          { title: `${loaderData.card} — ${loaderData.pack} — Praetorium` },
          { name: 'description', content: `${loaderData.card} secondary mission scoring, timing, and actions.` },
          { property: 'og:title', content: loaderData.card },
          { property: 'og:description', content: `${loaderData.card} secondary mission scoring, timing, and actions.` },
          { property: 'og:type', content: 'article' },
          breadcrumbMeta(match.context.origin, [
            { name: loaderData.pack, path: `/mission-packs/${params.packId}` },
            { name: loaderData.card, path: `/mission-packs/${params.packId}/secondary-missions/${params.cardId}` },
          ]),
        ]
      : [],
    links: loaderData ? [canonicalLink(match.context.origin, `/mission-packs/${params.packId}/secondary-missions/${params.cardId}`)] : [],
  }),
  component: () => <SecondaryMissionPage {...Route.useParams()} />,
})

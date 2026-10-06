import { createFileRoute, notFound, redirect } from '@tanstack/react-router'
import { SecondaryMissionPage } from '../client/features/reference/missions/SecondaryMissionPage'
import { gameReferencesQuery } from '../client/queries'
import { breadcrumbMeta, pageHead } from '../client/linkPreview'
import { routeSlug } from '../core/slug'

export const Route = createFileRoute('/missions/$packId_/secondaries/$cardId')({
  loader: async ({ context, params, location }) => {
    const data = await context.queryClient.query({ ...gameReferencesQuery(), staleTime: 'static' })
    const pack = data?.packs.find((candidate) => candidate.id === params.packId)
    const card = data?.secondaries.find((candidate) => candidate.key === params.cardId)
    if (pack && !card) {
      // Previously published URLs address cards by name slug rather than source id.
      const named = data!.secondaries.filter((candidate) => routeSlug(candidate.name) === params.cardId)
      if (named.length === 1)
        throw redirect({
          to: '/missions/$packId/secondaries/$cardId',
          params: { packId: pack.id, cardId: named[0]!.key },
          hash: location.hash,
          replace: true,
        })
    }
    if (!pack || !card) throw notFound()
    return { pack: pack.name, card: card.name }
  },
  head: ({ loaderData, match, params }) => {
    if (!loaderData) return {}
    const path = `/missions/${params.packId}/secondaries/${params.cardId}`
    const head = pageHead(match.context.origin, {
      title: `${loaderData.card} — ${loaderData.pack}`,
      description: `${loaderData.card} secondary mission scoring, timing, and actions.`,
      path,
      article: true,
    })
    return {
      meta: [
        ...head.meta,
        breadcrumbMeta(match.context.origin, [
          { name: loaderData.pack, path: `/missions/${params.packId}` },
          { name: loaderData.card, path },
        ]),
      ],
      links: head.links,
    }
  },
  component: () => <SecondaryMissionPage {...Route.useParams()} />,
})

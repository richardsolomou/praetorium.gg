import { useQuery } from '@tanstack/react-query'
import { createFileRoute, Link, notFound } from '@tanstack/react-router'
import { MissionActions } from '../client/components/MissionActions'
import { MissionCardReference } from '../client/components/MissionCardReference'
import { PageContent, PageHeader } from '../client/components/Page'
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
  component: SecondaryMissionPage,
})

function SecondaryMissionPage() {
  const { packId, cardId } = Route.useParams()
  const { data } = useQuery(gameReferencesQuery())
  const pack = data?.packs.find((candidate) => candidate.id === packId)
  const card = data?.secondaries.find((candidate) => candidate.key === cardId)
  if (!data || !pack || !card) return null

  return (
    <main className="w-full">
      <PageHeader eyebrow="Secondary mission" title={card.name} />
      <PageContent>
        <Link to="/mission-packs/$packId" params={{ packId }} className="eyebrow text-info">
          {pack.name}
        </Link>
        <section id={`secondary-${card.key}`} className="mt-4 scroll-mt-16 border border-edge bg-panel p-4">
          <MissionCardReference card={card} type="Secondary mission" />
          <MissionActions actions={card.actions} className="mt-4" />
        </section>
        <p className="mt-6 border-t border-edge pt-3 text-xs text-dim">{data.attribution}</p>
      </PageContent>
    </main>
  )
}

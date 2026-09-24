import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { MissionActions } from '../../../components/MissionActions'
import { MissionCardReference } from '../../../components/MissionCardReference'
import { PageContent, PageHeader } from '../../../components/Page'
import { gameReferencesQuery } from '../../../queries'

export function SecondaryMissionPage({ packId, cardId }: { packId: string; cardId: string }) {
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

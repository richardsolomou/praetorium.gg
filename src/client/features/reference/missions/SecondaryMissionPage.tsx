import { useQuery } from '@tanstack/react-query'
import { BackLink } from '../BackLink'
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
      <PageHeader title={card.name} />
      <PageContent className="space-y-6 *:max-w-3xl">
        <BackLink to="/missions/$packId" params={{ packId }}>
          {pack.name}
        </BackLink>
        <section id={`secondary-${card.key}`} className="scroll-mt-header">
          <MissionCardReference card={card} />
        </section>
      </PageContent>
    </main>
  )
}

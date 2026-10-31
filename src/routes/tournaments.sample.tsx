import { createFileRoute } from '@tanstack/react-router'
import { TournamentSample } from '../client/features/sealedEvents/TournamentSample'
import { SAMPLE_STAGES, type SampleStage } from '../client/features/sealedEvents/sampleTournament'
import { pageHead } from '../client/linkPreview'

export const Route = createFileRoute('/tournaments/sample')({
  // The first stage is the bare address, so each stage has one URL.
  // The key is always returned: an omitted one keeps the raw value, so an unknown stage would reach the page.
  validateSearch: (search: Record<string, unknown>): { stage?: SampleStage } => {
    const stage = SAMPLE_STAGES.find((candidate) => candidate === search.stage)
    return { stage: stage === SAMPLE_STAGES[0] ? undefined : stage }
  },
  head: ({ match }) =>
    pageHead(match.context.origin, {
      title: 'Sample tournament',
      description:
        'See how a Swiss tournament runs on Praetorium, from sealed lists and the reveal to paired rounds and standings, with made-up players.',
      path: '/tournaments/sample',
    }),
  component: SampleTournamentRoute,
})

function SampleTournamentRoute() {
  const { stage } = Route.useSearch()
  return <TournamentSample stage={stage ?? SAMPLE_STAGES[0]} />
}

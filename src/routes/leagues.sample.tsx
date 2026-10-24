import { createFileRoute } from '@tanstack/react-router'
import { LeagueSample } from '../client/features/leagues/LeagueSample'
import { LEAGUE_SAMPLE_STAGES, type LeagueSampleStage } from '../client/features/leagues/sampleLeague'
import { pageHead } from '../client/linkPreview'

export const Route = createFileRoute('/leagues/sample')({
  // The first stage is the bare address, so the page has one URL per stage.
  validateSearch: (search: Record<string, unknown>): { stage?: LeagueSampleStage } => {
    const stage = LEAGUE_SAMPLE_STAGES.find((candidate) => candidate === search.stage)
    return stage && stage !== 'join' ? { stage } : {}
  },
  head: ({ match }) =>
    pageHead(match.context.origin, {
      title: 'Sample league',
      description: 'See how a league runs, from registration and sealed rosters to the reveal and the results table, with made-up players.',
      path: '/leagues/sample',
    }),
  component: LeagueSampleRoute,
})

function LeagueSampleRoute() {
  const { stage } = Route.useSearch()
  return <LeagueSample stage={stage ?? 'join'} />
}

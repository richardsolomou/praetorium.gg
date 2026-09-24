import { createFileRoute } from '@tanstack/react-router'
import { CombatSimulator } from '../client/features/simulator/CombatSimulator'
import { pageMeta } from '../client/linkPreview'
import { factionIndexQuery } from '../client/queries'

export const Route = createFileRoute('/simulator')({
  loader: ({ context }) => context.queryClient.query({ ...factionIndexQuery(), staleTime: 'static' }),
  head: ({ match }) => ({
    meta: pageMeta(match.context.origin, {
      title: 'Combat simulator',
      description: 'Compare Warhammer 40,000 unit loadouts and estimate damage, casualties, and kill probabilities.',
      path: '/simulator',
    }),
  }),
  component: CombatSimulator,
})

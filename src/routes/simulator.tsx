import { createFileRoute } from '@tanstack/react-router'
import { CombatSimulator } from '../client/features/simulator/CombatSimulator'
import { factionIndexQuery } from '../client/queries'

export const Route = createFileRoute('/simulator')({
  loader: ({ context }) => context.queryClient.query({ ...factionIndexQuery(), staleTime: 'static' }),
  head: () => ({
    meta: [
      { title: 'Combat simulator — Praetorium' },
      { name: 'description', content: 'Compare Warhammer 40,000 unit loadouts and estimate damage, casualties, and kill probabilities.' },
    ],
  }),
  component: CombatSimulator,
})

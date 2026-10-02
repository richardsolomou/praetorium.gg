import { createFileRoute } from '@tanstack/react-router'
import { useCallback } from 'react'
import { CombatSimulator } from '../client/features/simulator/CombatSimulator'
import { pageHead } from '../client/linkPreview'
import { factionIndexQuery } from '../client/queries'

export const Route = createFileRoute('/simulator')({
  validateSearch: (search: Record<string, unknown>): { s?: string } => (typeof search.s === 'string' && search.s ? { s: search.s } : {}),
  loader: ({ context }) => context.queryClient.query({ ...factionIndexQuery(), staleTime: 'static' }),
  head: ({ match }) =>
    pageHead(match.context.origin, {
      title: 'Combat simulator',
      description: 'Compare Warhammer 40,000 unit loadouts and estimate damage, casualties, and kill probabilities.',
      path: '/simulator',
    }),
  component: SimulatorPage,
})

function SimulatorPage() {
  const { s } = Route.useSearch()
  const navigate = Route.useNavigate()
  const share = useCallback(
    (shared: string | undefined) => void navigate({ search: shared ? { s: shared } : {}, replace: true, resetScroll: false }),
    [navigate],
  )
  return <CombatSimulator shared={s} onShare={share} />
}

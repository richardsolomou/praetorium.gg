import { createFileRoute } from '@tanstack/react-router'
import { useCallback, useEffect, useState } from 'react'
import { CombatSimulator } from '../client/features/simulator/CombatSimulator'
import { pageHead } from '../client/linkPreview'
import { factionIndexQuery } from '../client/queries'

type SimulatorSearch = { s?: string; from?: 'datasheet' }

export const Route = createFileRoute('/simulator')({
  // `from` names the reference page that opened the simulator, for telemetry only; it is dropped on arrival.
  validateSearch: (search: Record<string, unknown>): SimulatorSearch => ({
    ...(typeof search.s === 'string' && search.s ? { s: search.s } : {}),
    ...(search.from === 'datasheet' ? { from: search.from } : {}),
  }),
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
  const { s, from } = Route.useSearch()
  const [reference] = useState(from)
  const navigate = Route.useNavigate()
  useEffect(() => {
    if (from) void navigate({ search: ({ from: _from, ...rest }) => rest, replace: true, resetScroll: false })
  }, [from, navigate])
  const share = useCallback(
    (shared: string | undefined) => void navigate({ search: shared ? { s: shared } : {}, replace: true, resetScroll: false }),
    [navigate],
  )
  return <CombatSimulator shared={s} onShare={share} reference={reference} />
}

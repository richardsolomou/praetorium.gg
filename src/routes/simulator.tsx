import { createFileRoute } from '@tanstack/react-router'
import { SimulatorRoute } from '../client/features/simulator/SimulatorRoute'
import { pageHead } from '../client/linkPreview'
import { factionIndexQuery } from '../client/queries'
import { searchText } from '../client/searchParams'

type SimulatorSearch = { s?: string; from?: 'datasheet' }

export const Route = createFileRoute('/simulator')({
  // `from` names the reference page that opened the simulator, for telemetry only; it is dropped on arrival.
  validateSearch: (search: Record<string, unknown>): SimulatorSearch => {
    const s = searchText(search.s)
    return { ...(s ? { s } : {}), ...(search.from === 'datasheet' ? { from: search.from } : {}) }
  },
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
  return <SimulatorRoute s={s} from={from} />
}

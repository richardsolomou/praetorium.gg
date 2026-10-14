import { createFileRoute } from '@tanstack/react-router'
import { type BattlesView, BattlesPage } from '../client/features/battles/BattlesPage'
import { battlesQuery, friendBattlesQuery, meQuery, publicBattlesQuery } from '../client/queries'
import { pageHead } from '../client/linkPreview'

const VIEWS = ['friends', 'public'] as const

export const Route = createFileRoute('/battles/')({
  validateSearch: (search: Record<string, unknown>): { view?: Exclude<BattlesView, 'mine'> } => ({
    view: VIEWS.find((view) => view === search.view),
  }),
  loaderDeps: ({ search }) => ({ view: search.view }),
  loader: async ({ context, deps }) => {
    const me = await context.queryClient.query({ ...meQuery(), staleTime: 'static' })
    const view = me ? (deps.view ?? 'mine') : 'public'
    const query = view === 'mine' ? battlesQuery() : view === 'friends' ? friendBattlesQuery() : publicBattlesQuery()
    await context.queryClient.infiniteQuery({ ...query, staleTime: 'static' })
  },
  head: ({ match }) =>
    pageHead(match.context.origin, {
      title: 'Warhammer 40,000 battle tracker',
      description:
        'Track Warhammer 40,000 phases, scores and command points with friends, play practice games, and watch or replay public battles.',
      path: '/battles',
    }),
  component: BattlesRoute,
})

function BattlesRoute() {
  return <BattlesPage view={Route.useSearch().view ?? 'mine'} />
}

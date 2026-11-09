import { createFileRoute } from '@tanstack/react-router'
import { BattlesPage } from '../client/features/battles/BattlesPage'
import { battleFilterOf, parseBattlesSearch } from '../client/features/battles/battleSearch'
import { battlesQuery, deploymentsQuery, friendBattlesQuery, meQuery, publicBattlesQuery } from '../client/queries'
import { pageHead } from '../client/linkPreview'

export const Route = createFileRoute('/battles/')({
  validateSearch: parseBattlesSearch,
  loaderDeps: ({ search }) => search,
  loader: async ({ context, deps }) => {
    const me = await context.queryClient.query({ ...meQuery(), staleTime: 'static' })
    const { view: asked, ...search } = deps
    const view = me ? (asked ?? 'mine') : 'public'
    const filter = battleFilterOf(search)
    const query = view === 'mine' ? battlesQuery(filter) : view === 'friends' ? friendBattlesQuery(filter) : publicBattlesQuery(filter)
    await Promise.all([
      context.queryClient.infiniteQuery({ ...query, staleTime: 'static' }),
      context.queryClient.query({ ...deploymentsQuery(), staleTime: 'static' }).catch(() => null),
    ])
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
  const { view, ...search } = Route.useSearch()
  return <BattlesPage view={view ?? 'mine'} search={search} />
}

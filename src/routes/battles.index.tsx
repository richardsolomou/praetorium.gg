import { createFileRoute } from '@tanstack/react-router'
import { BattlesPage } from '../client/features/battles/BattlesPage'
import { battleFilterOf, parseBattlesSearch } from '../client/features/battles/battleSearch'
import { battlesQuery, deploymentsQuery, friendBattlesQuery, meQuery, publicBattlesQuery } from '../client/queries'
import { pageHead } from '../client/linkPreview'

export const Route = createFileRoute('/battles/')({
  validateSearch: parseBattlesSearch,
  // Keyed by the tab alone, so a filter change keeps the page and its list refetches in place instead of blocking navigation.
  loaderDeps: ({ search }) => ({ view: search.view }),
  loader: async ({ context, location }) => {
    const me = await context.queryClient.query({ ...meQuery(), staleTime: 'static' })
    const { view: asked, order, ...search } = parseBattlesSearch(location.search)
    const view = me ? (asked ?? 'mine') : 'public'
    const filter = battleFilterOf(search)
    const query =
      view === 'mine'
        ? battlesQuery(filter, order)
        : view === 'friends'
          ? friendBattlesQuery(filter, order)
          : publicBattlesQuery(filter, order)
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
  const { view, order, ...search } = Route.useSearch()
  return <BattlesPage view={view ?? 'mine'} search={search} order={order} />
}

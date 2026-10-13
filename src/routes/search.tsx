import { createFileRoute } from '@tanstack/react-router'
import { SearchPage } from '../client/features/shell/SearchPage'
import { pageHead } from '../client/linkPreview'
import { globalSearchQuery } from '../client/queries'

export const Route = createFileRoute('/search')({
  validateSearch: (search: Record<string, unknown>) => ({
    q: typeof search.q === 'string' ? search.q.slice(0, 80) : '',
  }),
  loaderDeps: ({ search }) => search,
  loader: async ({ context, deps, cause }) => {
    const query = deps.q.trim()
    if (cause !== 'stay' && query.length >= 2) {
      await context.queryClient.query(globalSearchQuery(query)).catch(() => undefined)
    }
  },
  head: ({ match }) =>
    pageHead(match.context.origin, {
      title: 'Search Praetorium',
      description: 'Search factions, datasheets, detachments, missions, rules, rosters and battles.',
      path: '/search',
      noindex: true,
    }),
  component: SearchRoute,
})

function SearchRoute() {
  return <SearchPage query={Route.useSearch().q} />
}

import { createFileRoute } from '@tanstack/react-router'
import { CatalogueChangesPage } from '../client/features/changes/CatalogueChangesPage'
import { pageHead } from '../client/linkPreview'
import { catalogueChangeLogQuery, historySearch } from '../client/queries'

export const Route = createFileRoute('/data-updates/')({
  validateSearch: historySearch,
  loaderDeps: ({ search }) => ({ before: search.before }),
  loader: ({ context, deps }) => context.queryClient.query({ ...catalogueChangeLogQuery(deps.before), staleTime: 'static' }),
  // An older page is still read, but only the newest is the address search results lead to.
  head: ({ match }) =>
    pageHead(match.context.origin, {
      title: 'Data updates',
      description: 'The points, datasheets and detachments each Warhammer 40,000 army data update changed.',
      path: match.search.before ? undefined : '/data-updates',
    }),
  component: ChangesRoute,
})

function ChangesRoute() {
  return <CatalogueChangesPage before={Route.useSearch().before} />
}

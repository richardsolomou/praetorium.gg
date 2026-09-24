import { createFileRoute } from '@tanstack/react-router'
import { CatalogueChangesPage } from '../client/features/changes/CatalogueChangesPage'
import { catalogueChangeLogQuery } from '../client/queries'

export const Route = createFileRoute('/changes')({
  validateSearch: (search: Record<string, unknown>): { before?: string } =>
    typeof search.before === 'string' && /^[\w-]{1,4096}$/.test(search.before) ? { before: search.before } : {},
  loaderDeps: ({ search }) => ({ before: search.before }),
  loader: ({ context, deps }) => context.queryClient.query({ ...catalogueChangeLogQuery(deps.before), staleTime: 'static' }),
  head: () => ({
    meta: [
      { title: 'Data updates — Praetorium' },
      { name: 'description', content: 'The points, datasheets and detachments each Warhammer 40,000 army data update changed.' },
    ],
  }),
  component: ChangesRoute,
})

function ChangesRoute() {
  return <CatalogueChangesPage before={Route.useSearch().before} />
}

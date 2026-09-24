import { createFileRoute } from '@tanstack/react-router'
import { CatalogueChangesPage } from '../client/features/changes/CatalogueChangesPage'
import { catalogueChangeLogQuery } from '../client/queries'

export const Route = createFileRoute('/changes')({
  loader: ({ context }) => context.queryClient.query({ ...catalogueChangeLogQuery(), staleTime: 'static' }),
  head: () => ({
    meta: [
      { title: 'Data updates — Praetorium' },
      { name: 'description', content: 'The points, datasheets and detachments each Warhammer 40,000 army data update changed.' },
    ],
  }),
  component: CatalogueChangesPage,
})

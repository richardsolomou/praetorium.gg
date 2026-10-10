import { createFileRoute, notFound } from '@tanstack/react-router'
import { FactionDatasheets } from '../client/features/reference/factions/FactionDatasheets'
import { factionDatasheetsQuery, loadReferenceFaction } from '../client/queries'

export const Route = createFileRoute('/factions/$catalogueId/reference/datasheets')({
  loaderDeps: ({ search }) => ({ rules: search.rules }),
  loader: async ({ context, params, deps }) => {
    const faction = await loadReferenceFaction(context.queryClient, params.catalogueId, deps.rules)
    if (!faction) throw notFound()
    await context.queryClient.query({ ...factionDatasheetsQuery(faction.id, ''), staleTime: 'static' })
  },
  component: FactionDatasheets,
})

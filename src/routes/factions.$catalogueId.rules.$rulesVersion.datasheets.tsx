import { createFileRoute, notFound } from '@tanstack/react-router'
import { FactionDatasheets } from '../client/features/reference/factions/FactionDatasheets'
import { factionDatasheetsQuery, loadReferenceFaction } from '../client/queries'

export const Route = createFileRoute('/factions/$catalogueId/rules/$rulesVersion/datasheets')({
  loader: async ({ context, params }) => {
    const faction = await loadReferenceFaction(context.queryClient, params.catalogueId, params.rulesVersion)
    if (!faction) throw notFound()
    await context.queryClient.query({ ...factionDatasheetsQuery(faction.id, ''), staleTime: 'static' })
  },
  component: FactionDatasheets,
})

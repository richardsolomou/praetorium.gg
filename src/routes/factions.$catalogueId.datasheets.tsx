import { createFileRoute, notFound } from '@tanstack/react-router'
import { FactionDatasheets } from '../client/components/FactionDatasheets'
import { factionFor } from '../client/factions'
import { collectionQuery, factionDatasheetsQuery, factionsQuery } from '../client/queries'

export const Route = createFileRoute('/factions/$catalogueId/datasheets')({
  loader: async ({ context, params }) => {
    const data = await context.queryClient.ensureQueryData(factionsQuery())
    const faction = factionFor(data, params.catalogueId)
    if (!faction) throw notFound()
    // Render the page shell immediately. The list can finish pricing behind its
    // loading state instead of holding the route transition on a large faction.
    void context.queryClient.prefetchQuery(factionDatasheetsQuery(faction.id, ''))
    void context.queryClient.prefetchQuery(collectionQuery())
  },
  component: FactionDatasheets,
})

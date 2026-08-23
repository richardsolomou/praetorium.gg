import { createFileRoute, notFound } from '@tanstack/react-router'
import { FactionDatasheets } from '../client/components/FactionDatasheets'
import { factionFor } from '../client/factions'
import { collectionQuery, factionDatasheetsQuery, factionsQuery } from '../client/queries'

export const Route = createFileRoute('/factions/$catalogueId/datasheets')({
  loader: async ({ context, params }) => {
    const data = await context.queryClient.ensureQueryData(factionsQuery())
    const faction = factionFor(data, params.catalogueId)
    if (!faction) throw notFound()
    // Settle the datasheets on the server so the rendered markup and the
    // dehydrated cache agree, which is what keeps the first client render from
    // mismatching the server list. The collection is per-user, so it stays
    // non-blocking and only reorders the list after mount.
    await context.queryClient.ensureQueryData(factionDatasheetsQuery(faction.id, ''))
    void context.queryClient.prefetchQuery(collectionQuery())
  },
  component: FactionDatasheets,
})

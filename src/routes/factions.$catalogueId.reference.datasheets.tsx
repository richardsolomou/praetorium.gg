import { createFileRoute, notFound } from '@tanstack/react-router'
import { FactionDatasheets } from '../client/components/FactionDatasheets'
import { factionFor } from '../client/factions'
import { collectionQuery, factionDatasheetsQuery, factionsQuery } from '../client/queries'

export const Route = createFileRoute('/factions/$catalogueId/reference/datasheets')({
  loader: async ({ context, params }) => {
    const data = await context.queryClient.ensureQueryData(factionsQuery())
    const faction = factionFor(data, params.catalogueId)
    if (!faction) throw notFound()
    await Promise.all([
      context.queryClient.ensureQueryData(factionDatasheetsQuery(faction.id, '')),
      context.queryClient.ensureQueryData(collectionQuery()),
    ])
  },
  component: FactionDatasheets,
})

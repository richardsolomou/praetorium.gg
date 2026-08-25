import { createFileRoute, notFound } from '@tanstack/react-router'
import { FactionDatasheets } from '../client/components/FactionDatasheets'
import { collectionQuery, factionDatasheetsQuery, factionQuery } from '../client/queries'

export const Route = createFileRoute('/factions/$catalogueId/reference/datasheets')({
  loader: async ({ context, params }) => {
    const faction = await context.queryClient.ensureQueryData(factionQuery(params.catalogueId))
    if (!faction) throw notFound()
    await Promise.all([
      context.queryClient.ensureQueryData(factionDatasheetsQuery(faction.id, '')),
      context.queryClient.ensureQueryData(collectionQuery()),
    ])
  },
  component: FactionDatasheets,
})

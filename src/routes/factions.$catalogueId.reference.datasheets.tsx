import { createFileRoute, notFound } from '@tanstack/react-router'
import { FactionDatasheets } from '../client/components/FactionDatasheets'
import { factionDatasheetsQuery, factionQuery } from '../client/queries'

export const Route = createFileRoute('/factions/$catalogueId/reference/datasheets')({
  loader: async ({ context, params }) => {
    const faction = await context.queryClient.ensureQueryData(factionQuery(params.catalogueId))
    if (!faction) throw notFound()
    await context.queryClient.ensureQueryData(factionDatasheetsQuery(faction.id, ''))
  },
  component: FactionDatasheets,
})

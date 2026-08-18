import { createFileRoute, notFound } from '@tanstack/react-router'
import { factionFor } from '../client/factions'
import { factionDatasheetsQuery, factionsQuery } from '../client/queries'
import { DatasheetsPage } from './factions.$catalogueId.reference.datasheets'

export const Route = createFileRoute('/factions/$catalogueId/datasheets')({
  loader: async ({ context, params }) => {
    const data = await context.queryClient.ensureQueryData(factionsQuery())
    const faction = factionFor(data, params.catalogueId)
    if (!faction) throw notFound()
    await context.queryClient.ensureQueryData(factionDatasheetsQuery(faction.id, ''))
  },
  component: DatasheetsPage,
})

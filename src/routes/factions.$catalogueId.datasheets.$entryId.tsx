import { createFileRoute, notFound } from '@tanstack/react-router'
import { FactionDatasheet } from '../client/components/FactionDatasheet'
import { factionFor } from '../client/factions'
import { datasheetSlugQuery, factionsQuery } from '../client/queries'

export const Route = createFileRoute('/factions/$catalogueId/datasheets/$entryId')({
  loader: async ({ context, params }) => {
    const data = await context.queryClient.ensureQueryData(factionsQuery())
    const faction = factionFor(data, params.catalogueId)
    if (!faction || !(await context.queryClient.ensureQueryData(datasheetSlugQuery(faction.id, params.entryId)))) throw notFound()
  },
  component: FactionDatasheet,
})

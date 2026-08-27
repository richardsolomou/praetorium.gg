import { createFileRoute, notFound } from '@tanstack/react-router'
import { FactionDatasheet } from '../client/components/FactionDatasheet'
import { datasheetSlugQuery, factionQuery } from '../client/queries'

export const Route = createFileRoute('/factions/$catalogueId/datasheets/$entryId')({
  loader: async ({ context, params }) => {
    const faction = await context.queryClient.ensureQueryData(factionQuery(params.catalogueId))
    if (!faction) throw notFound()
    const sheet = await context.queryClient.ensureQueryData(datasheetSlugQuery(faction.id, params.entryId))
    if (!sheet) throw notFound()
  },
  component: FactionDatasheet,
})

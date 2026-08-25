import { createFileRoute, notFound } from '@tanstack/react-router'
import { FactionDatasheet } from '../client/components/FactionDatasheet'
import { datasheetSlugQuery, factionQuery } from '../client/queries'

export const Route = createFileRoute('/factions/$catalogueId/datasheets/$entryId')({
  loader: async ({ context, params }) => {
    const faction = await context.queryClient.ensureQueryData(factionQuery(params.catalogueId))
    if (!faction || !(await context.queryClient.ensureQueryData(datasheetSlugQuery(faction.id, params.entryId)))) throw notFound()
  },
  component: FactionDatasheet,
})

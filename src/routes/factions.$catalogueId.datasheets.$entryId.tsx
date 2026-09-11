import { createFileRoute, notFound } from '@tanstack/react-router'
import { FactionDatasheet } from '../client/components/FactionDatasheet'
import { datasheetSlugQuery, factionQuery } from '../client/queries'

export const Route = createFileRoute('/factions/$catalogueId/datasheets/$entryId')({
  loader: async ({ context, params }) => {
    const faction = await context.queryClient.query({ ...factionQuery(params.catalogueId), staleTime: 'static' })
    if (!faction) throw notFound()
    const sheet = await context.queryClient.query({ ...datasheetSlugQuery(faction.id, params.entryId), staleTime: 'static' })
    if (!sheet) throw notFound()
  },
  component: FactionDatasheet,
})

import { createFileRoute, notFound } from '@tanstack/react-router'
import { FactionDatasheet } from '../client/components/FactionDatasheet'
import { collectionQuery, datasheetSlugQuery, factionQuery, meQuery } from '../client/queries'

export const Route = createFileRoute('/factions/$catalogueId/datasheets/$entryId')({
  loader: async ({ context, params }) => {
    const [me, faction] = await Promise.all([
      context.queryClient.ensureQueryData(meQuery()),
      context.queryClient.ensureQueryData(factionQuery(params.catalogueId)),
    ])
    if (!faction) throw notFound()
    const [sheet] = await Promise.all([
      context.queryClient.ensureQueryData(datasheetSlugQuery(faction.id, params.entryId)),
      ...(me ? [context.queryClient.ensureQueryData(collectionQuery()).catch(() => undefined)] : []),
    ])
    if (!sheet) throw notFound()
  },
  component: FactionDatasheet,
})

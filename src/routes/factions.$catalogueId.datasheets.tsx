import { createFileRoute, notFound } from '@tanstack/react-router'
import { FactionDatasheets } from '../client/components/FactionDatasheets'
import { collectionQuery, factionDatasheetsQuery, factionQuery, meQuery } from '../client/queries'

export const Route = createFileRoute('/factions/$catalogueId/datasheets')({
  loader: async ({ context, params }) => {
    const [me, faction] = await Promise.all([
      context.queryClient.ensureQueryData(meQuery()),
      context.queryClient.ensureQueryData(factionQuery(params.catalogueId)),
    ])
    if (!faction) throw notFound()
    await Promise.all([
      context.queryClient.ensureQueryData(factionDatasheetsQuery(faction.id, '')),
      ...(me ? [context.queryClient.ensureQueryData(collectionQuery()).catch(() => undefined)] : []),
    ])
  },
  component: FactionDatasheets,
})

import { createFileRoute, notFound } from '@tanstack/react-router'
import { FactionDatasheets } from '../client/components/FactionDatasheets'
import { factionDatasheetsQuery, factionQuery } from '../client/queries'

export const Route = createFileRoute('/factions/$catalogueId/datasheets')({
  loader: async ({ context, params }) => {
    const faction = await context.queryClient.ensureQueryData(factionQuery(params.catalogueId))
    if (!faction) throw notFound()
    // Settle the datasheets on the server so the rendered markup and the
    // dehydrated cache agree, which is what keeps the first client render from
    // mismatching the server list. The collection is per-user and fetched by
    // the client after mount instead: a query still in flight when the SSR
    // response finishes streams a chunk that never arrives, leaving that
    // client fetch stuck pending forever rather than merely late.
    await context.queryClient.ensureQueryData(factionDatasheetsQuery(faction.id, ''))
  },
  component: FactionDatasheets,
})

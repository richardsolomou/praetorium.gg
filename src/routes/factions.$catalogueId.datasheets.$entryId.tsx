import { createFileRoute } from '@tanstack/react-router'
import { FactionDatasheet } from '../client/features/reference/factions/FactionDatasheet'
import { loadFactionDatasheet, factionDatasheetHead } from '../client/features/reference/factions/referenceRouteData'

export const Route = createFileRoute('/factions/$catalogueId/datasheets/$entryId')({
  loaderDeps: ({ search }) => ({ rules: search.rules }),
  loader: ({ context, params, deps }) => loadFactionDatasheet(context.queryClient, params.catalogueId, params.entryId, deps.rules),
  head: ({ loaderData, match }) => factionDatasheetHead(loaderData, match.context.origin),
  component: FactionDatasheet,
})

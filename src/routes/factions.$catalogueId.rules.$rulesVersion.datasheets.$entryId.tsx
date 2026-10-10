import { createFileRoute } from '@tanstack/react-router'
import { FactionDatasheet } from '../client/features/reference/factions/FactionDatasheet'
import { loadFactionDatasheet, factionDatasheetHead } from '../client/features/reference/factions/referenceRouteData'

export const Route = createFileRoute('/factions/$catalogueId/rules/$rulesVersion/datasheets/$entryId')({
  loader: ({ context, params }) => loadFactionDatasheet(context.queryClient, params.catalogueId, params.entryId, params.rulesVersion),
  head: ({ loaderData, match }) => factionDatasheetHead(loaderData, match.context.origin),
  component: FactionDatasheet,
})

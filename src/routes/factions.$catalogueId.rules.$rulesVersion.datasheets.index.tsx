import { createFileRoute } from '@tanstack/react-router'
import { FactionDatasheets } from '../client/features/reference/factions/FactionDatasheets'
import { loadFactionDatasheets, factionDatasheetsHead } from '../client/features/reference/factions/referenceRouteData'

export const Route = createFileRoute('/factions/$catalogueId/rules/$rulesVersion/datasheets/')({
  loader: ({ context, params }) => loadFactionDatasheets(context.queryClient, params.catalogueId, params.rulesVersion),
  head: ({ loaderData, match }) => factionDatasheetsHead(loaderData, match.context.origin),
  component: FactionDatasheets,
})

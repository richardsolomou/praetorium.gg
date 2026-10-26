import { createFileRoute } from '@tanstack/react-router'
import { FactionDatasheets } from '../client/features/reference/factions/FactionDatasheets'
import { loadFactionDatasheets, factionDatasheetsHead } from '../client/features/reference/factions/referenceRouteData'

export const Route = createFileRoute('/factions/$catalogueId/datasheets/')({
  loaderDeps: ({ search }) => ({ rules: search.rules }),
  loader: ({ context, params, deps }) => loadFactionDatasheets(context.queryClient, params.catalogueId, deps.rules),
  head: ({ loaderData, match }) => factionDatasheetsHead(loaderData, match.context.origin),
  component: FactionDatasheets,
})

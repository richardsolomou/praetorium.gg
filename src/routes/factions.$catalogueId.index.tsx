import { createFileRoute } from '@tanstack/react-router'
import { FactionPage } from '../client/features/reference/factions/FactionPage'
import { loadFactionPage, factionPageHead } from '../client/features/reference/factions/referenceRouteData'

export const Route = createFileRoute('/factions/$catalogueId/')({
  loaderDeps: ({ search }) => ({ rules: search.rules }),
  loader: ({ context, params, deps }) => loadFactionPage(context.queryClient, params.catalogueId, deps.rules),
  head: ({ loaderData, match }) => factionPageHead(loaderData, match.context.origin),
  component: () => <FactionPage catalogueId={Route.useLoaderData().id} />,
})

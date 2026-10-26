import { createFileRoute } from '@tanstack/react-router'
import { FactionPage } from '../client/features/reference/factions/FactionPage'
import { loadFactionPage, factionPageHead } from '../client/features/reference/factions/referenceRouteData'

export const Route = createFileRoute('/factions/$catalogueId/rules/$rulesVersion/')({
  loader: ({ context, params }) => loadFactionPage(context.queryClient, params.catalogueId, params.rulesVersion),
  head: ({ loaderData, match }) => factionPageHead(loaderData, match.context.origin),
  component: () => <FactionPage catalogueId={Route.useLoaderData().id} />,
})

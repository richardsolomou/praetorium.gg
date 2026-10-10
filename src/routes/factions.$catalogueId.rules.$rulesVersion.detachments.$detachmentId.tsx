import { createFileRoute } from '@tanstack/react-router'
import { FactionDetachment } from '../client/features/reference/factions/FactionDetachment'
import { loadFactionDetachment, factionDetachmentHead } from '../client/features/reference/factions/referenceRouteData'

export const Route = createFileRoute('/factions/$catalogueId/rules/$rulesVersion/detachments/$detachmentId')({
  loader: ({ context, params }) => loadFactionDetachment(context.queryClient, params.catalogueId, params.detachmentId, params.rulesVersion),
  head: ({ loaderData, match, params }) => factionDetachmentHead(loaderData, match.context.origin, params.detachmentId),
  component: FactionDetachment,
})

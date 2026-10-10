import { createFileRoute } from '@tanstack/react-router'
import { FactionDetachment } from '../client/features/reference/factions/FactionDetachment'
import { loadFactionDetachment, factionDetachmentHead } from '../client/features/reference/factions/referenceRouteData'

export const Route = createFileRoute('/factions/$catalogueId/detachments/$detachmentId')({
  loaderDeps: ({ search }) => ({ rules: search.rules }),
  loader: ({ context, params, deps }) => loadFactionDetachment(context.queryClient, params.catalogueId, params.detachmentId, deps.rules),
  head: ({ loaderData, match, params }) => factionDetachmentHead(loaderData, match.context.origin, params.detachmentId),
  component: FactionDetachment,
})

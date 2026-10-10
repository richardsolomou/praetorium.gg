import { createFileRoute, notFound } from '@tanstack/react-router'
import { FactionDetachment } from '../client/features/reference/factions/FactionDetachment'
import { detachmentDetailQuery, loadReferenceFaction } from '../client/queries'

export const Route = createFileRoute('/factions/$catalogueId/reference/detachments/$detachmentId')({
  loaderDeps: ({ search }) => ({ rules: search.rules }),
  loader: async ({ context, params, deps }) => {
    const faction = await loadReferenceFaction(context.queryClient, params.catalogueId, deps.rules)
    if (!faction) throw notFound()
    const route = faction.detachments.find((detachment) => detachment.slug === params.detachmentId)?.referenceRoute
    if (
      (route && (route.catalogueId !== faction.slug || route.slug !== params.detachmentId)) ||
      !(await context.queryClient.query({ ...detachmentDetailQuery(faction.id, params.detachmentId), staleTime: 'static' }))
    )
      throw notFound()
  },
  component: FactionDetachment,
})

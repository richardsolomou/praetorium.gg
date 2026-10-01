import { createFileRoute, notFound } from '@tanstack/react-router'
import { FactionDetachment } from '../client/features/reference/factions/FactionDetachment'
import { detachmentDetailQuery, factionQuery } from '../client/queries'

export const Route = createFileRoute('/factions/$catalogueId/reference/detachments/$detachmentId')({
  loader: async ({ context, params }) => {
    const faction = await context.queryClient.query({ ...factionQuery(params.catalogueId), staleTime: 'static' })
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

import { createFileRoute, notFound } from '@tanstack/react-router'
import { FactionDetachment } from '../client/components/FactionDetachment'
import { detachmentDetailQuery, factionQuery, favouriteDetachmentsQuery } from '../client/queries'

export const Route = createFileRoute('/factions/$catalogueId/detachments/$detachmentId')({
  loader: async ({ context, params }) => {
    const [faction] = await Promise.all([
      context.queryClient.query({ ...factionQuery(params.catalogueId), staleTime: 'static' }),
      context.queryClient.query({ ...favouriteDetachmentsQuery(), staleTime: 'static' }),
    ])
    if (
      !faction ||
      !(await context.queryClient.query({ ...detachmentDetailQuery(faction.id, params.detachmentId), staleTime: 'static' }))
    ) {
      throw notFound()
    }
  },
  component: FactionDetachment,
})

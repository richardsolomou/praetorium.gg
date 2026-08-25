import { createFileRoute, notFound } from '@tanstack/react-router'
import { FactionDetachment } from '../client/components/FactionDetachment'
import { detachmentDetailQuery, factionQuery, favouriteDetachmentsQuery } from '../client/queries'

export const Route = createFileRoute('/factions/$catalogueId/detachments/$detachmentId')({
  loader: async ({ context, params }) => {
    const [faction] = await Promise.all([
      context.queryClient.ensureQueryData(factionQuery(params.catalogueId)),
      context.queryClient.ensureQueryData(favouriteDetachmentsQuery()),
    ])
    if (!faction || !(await context.queryClient.ensureQueryData(detachmentDetailQuery(faction.id, params.detachmentId)))) {
      throw notFound()
    }
  },
  component: FactionDetachment,
})

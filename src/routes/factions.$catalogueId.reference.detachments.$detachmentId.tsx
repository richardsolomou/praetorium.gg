import { createFileRoute, notFound } from '@tanstack/react-router'
import { FactionDetachment } from '../client/components/FactionDetachment'
import { detachmentDetailQuery, factionQuery } from '../client/queries'

export const Route = createFileRoute('/factions/$catalogueId/reference/detachments/$detachmentId')({
  loader: async ({ context, params }) => {
    const faction = await context.queryClient.ensureQueryData(factionQuery(params.catalogueId))
    if (!faction || !(await context.queryClient.ensureQueryData(detachmentDetailQuery(faction.id, params.detachmentId)))) {
      throw notFound()
    }
  },
  component: FactionDetachment,
})

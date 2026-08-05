import { createFileRoute, notFound } from '@tanstack/react-router'
import { factionFor } from '../client/factions'
import { detachmentDetailQuery, factionsQuery } from '../client/queries'
import { DetachmentPage } from './factions.$catalogueId.reference.detachments.$detachmentId'

export const Route = createFileRoute('/factions/$catalogueId/detachments/$detachmentId')({
  loader: async ({ context, params }) => {
    const data = await context.queryClient.ensureQueryData(factionsQuery())
    const faction = factionFor(data, params.catalogueId)
    if (!faction || !(await context.queryClient.ensureQueryData(detachmentDetailQuery(faction.id, params.detachmentId)))) {
      throw notFound()
    }
  },
  component: DetachmentPage,
})

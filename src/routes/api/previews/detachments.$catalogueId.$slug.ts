import { createFileRoute } from '@tanstack/react-router'
import { detachmentPreview } from '../../../client/linkPreview'
import { app } from '../../../server/app'
import { detachmentReference } from '../../../shared/detachmentReference'
import { previewResponse } from '../../../server/previewImage'
import { detachmentDetailSchema } from '../../../contracts/schemas'

/** A detachment changes only when a release installs another snapshot. */
const REFERENCE_SECONDS = 3600

export const Route = createFileRoute('/api/previews/detachments/$catalogueId/$slug')({
  server: {
    handlers: {
      GET: ({ params }) =>
        previewResponse(async () => {
          if (!detachmentDetailSchema.safeParse(params).success) return null
          const instance = app()
          const faction = (await instance.factionsFor())?.factions.find((one) => one.slug === params.catalogueId)
          if (!faction) return null
          const [catalogue, rules] = await Promise.all([instance.catalogueFor(faction.id), instance.rulesFor()])
          const detachment = catalogue && rules ? detachmentReference(catalogue, rules, faction.id, params.slug) : null
          return detachment ? { card: detachmentPreview(detachment.name, faction.displayName).card, maxAge: REFERENCE_SECONDS } : null
        }),
    },
  },
})

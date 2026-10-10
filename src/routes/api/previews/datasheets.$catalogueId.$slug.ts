import { createFileRoute } from '@tanstack/react-router'
import { datasheetPreview } from '../../../client/linkPreview'
import { app } from '../../../server/app'
import { previewResponse } from '../../../server/previewImage'
import { datasheetSlugSchema } from '../../../server/schemas'

/** Points move only when a release installs another snapshot. */
const REFERENCE_SECONDS = 3600

export const Route = createFileRoute('/api/previews/datasheets/$catalogueId/$slug')({
  server: {
    handlers: {
      GET: ({ params }) =>
        previewResponse(async () => {
          if (!datasheetSlugSchema.safeParse(params).success) return null
          const instance = app()
          const faction = await instance.factionFor(params.catalogueId)
          const canonical = await instance.canonicalCatalogueFor(faction?.id)
          const sheet = faction && canonical?.datasheets.find((one) => one.catalogueId === faction.id && one.slug === params.slug)
          return sheet ? { card: datasheetPreview(sheet, faction.displayName).card, maxAge: REFERENCE_SECONDS } : null
        }),
    },
  },
})

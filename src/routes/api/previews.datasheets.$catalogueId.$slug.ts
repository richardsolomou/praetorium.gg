import { createFileRoute } from '@tanstack/react-router'
import { datasheetPreview } from '../../client/linkPreview'
import { app } from '../../server/app'
import { previewResponse } from '../../server/previewImage'
import { datasheetSlugSchema } from '../../server/schemas'

/** Points move only when a release installs another snapshot. */
const REFERENCE_SECONDS = 3600

export const Route = createFileRoute('/api/previews/datasheets/$catalogueId/$slug')({
  server: {
    handlers: {
      GET: ({ params }) =>
        previewResponse(async () => {
          if (!datasheetSlugSchema.safeParse(params).success) return null
          const instance = app()
          // Found the way the page finds it: the faction by its slug, then its own sheet by slug.
          const faction = (await instance.factionsFor())?.factions.find((one) => one.slug === params.catalogueId)
          const canonical = await instance.canonicalCatalogueFor()
          const sheet = faction && canonical?.datasheets.find((one) => one.catalogueId === faction.id && one.slug === params.slug)
          return sheet ? { card: datasheetPreview(sheet, faction.displayName).card, maxAge: REFERENCE_SECONDS } : null
        }),
    },
  },
})

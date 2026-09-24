import { createFileRoute } from '@tanstack/react-router'
import { rosterPreview } from '../../client/linkPreview'
import { app } from '../../server/app'
import { factionIndexFor } from '../../server/factionReferences'
import { previewResponse } from '../../server/previewImage'
import { cachedRosterPrice } from '../../server/rosterPrices'
import { rosterIdSchema } from '../../server/schemas'

/** An owner can rename a list or take it private, so its picture is not held for long. */
const ROSTER_SECONDS = 300

export const Route = createFileRoute('/api/previews/rosters/$id')({
  server: {
    handlers: {
      GET: ({ params }) =>
        previewResponse(async () => {
          if (!rosterIdSchema.safeParse(params).success) return null
          const instance = app()
          // No reader and no battle: only an unlisted or public list answers a stranger.
          const access = await instance.service.rosterAccess(params.id, null, null)
          if (!access) return null
          const { roster } = access
          const loaded = instance.catalogue()
          const faction = loaded
            ? (factionIndexFor(loaded, instance.rules()).factions.find((one) => one.id === roster.catalogueId) ?? null)
            : null
          return { card: rosterPreview(roster, faction, cachedRosterPrice(roster)).card, maxAge: ROSTER_SECONDS }
        }),
    },
  },
})

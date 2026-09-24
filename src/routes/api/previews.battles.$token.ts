import { createFileRoute } from '@tanstack/react-router'
import { battlePreview } from '../../client/linkPreview'
import { app } from '../../server/app'
import { factionIndexFor } from '../../server/factionReferences'
import { previewResponse } from '../../server/previewImage'
import { tokenSchema } from '../../server/schemas'

/** A live score moves, so its picture is held briefly; a finished one only changes if the battle is reopened. */
const LIVE_SECONDS = 60
const FINISHED_SECONDS = 600

export const Route = createFileRoute('/api/previews/battles/$token')({
  server: {
    handlers: {
      GET: ({ params }) =>
        previewResponse(async () => {
          if (!tokenSchema.safeParse(params).success) return null
          const instance = app()
          // No viewer, whoever is asking: a signed-out reader's screen is what a crawler would be shown.
          const screen = await instance.service.screen(params.token, null, instance.rules()).catch((error: unknown) => {
            if (error instanceof Response && error.status === 404) return null
            throw error
          })
          if (screen?.kind !== 'spectator') return null
          const loaded = instance.catalogue()
          const factions = new Map(
            loaded ? factionIndexFor(loaded, instance.rules()).factions.map((faction) => [faction.id, faction.displayName]) : [],
          )
          return {
            card: battlePreview(screen.view, (catalogueId) => factions.get(catalogueId) ?? null).card,
            maxAge: screen.view.status === 'finished' ? FINISHED_SECONDS : LIVE_SECONDS,
          }
        }),
    },
  },
})

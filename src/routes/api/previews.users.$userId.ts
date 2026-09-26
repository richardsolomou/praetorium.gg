import { createFileRoute } from '@tanstack/react-router'
import { playerPreview } from '../../client/linkPreview'
import { app } from '../../server/app'
import { previewResponse } from '../../server/previewImage'
import { userSchema } from '../../server/schemas'

/** A record moves only when one of the player's battles finishes. */
const PLAYER_SECONDS = 300

export const Route = createFileRoute('/api/previews/users/$userId')({
  server: {
    handlers: {
      GET: ({ params }) =>
        previewResponse(async () => {
          if (!userSchema.safeParse(params).success) return null
          const instance = app()
          const profile = await instance.service.userProfile(params.userId)
          if (!profile) return null
          // The same factions the leaderboard folds with, because the standings it reads are held for everyone.
          const factions = (await instance.factionIndexFor())?.factions ?? []
          const rules = await instance.rulesFor()
          // No viewer: the record and the rank are what a signed-out reader of the profile is shown.
          const [{ record }, rankings] = await Promise.all([
            instance.service.playerProfile(params.userId, null, {}, rules, factions),
            instance.service.playerRankings(params.userId, factions),
          ])
          return { card: playerPreview(profile.name, record, rankings).card, maxAge: PLAYER_SECONDS }
        }),
    },
  },
})

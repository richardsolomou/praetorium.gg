import { createFileRoute } from '@tanstack/react-router'
import { playerPreview } from '../../../client/linkPreview'
import { app } from '../../../server/app'
import { previewResponse } from '../../../server/previewImage'
import { userSchema } from '../../../contracts/schemas'

export const Route = createFileRoute('/api/previews/users/$userId')({
  server: {
    handlers: {
      GET: ({ params }) =>
        previewResponse(async () => {
          if (!userSchema.safeParse(params).success) return null
          const instance = app()
          const profile = await instance.service.userProfile(params.userId)
          if (!profile) return null
          const factions = (await instance.factionIndexFor())?.factions ?? []
          const rules = await instance.rulesFor()
          // No viewer: the record and the rank are what a signed-out reader of the profile is shown.
          const [{ record }, rankings] = await Promise.all([
            instance.service.playerProfile(params.userId, null, {}, rules, factions),
            instance.service.playerRankings(params.userId),
          ])
          return { card: playerPreview(profile.name, record, rankings).card, maxAge: 0 }
        }),
    },
  },
})

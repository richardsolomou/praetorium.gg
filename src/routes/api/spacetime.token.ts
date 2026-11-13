import { createFileRoute } from '@tanstack/react-router'
import { app } from '../../server/app'
import { currentUserId } from '../../server/playerSession'
import { spacetimePublicUri } from '../../server/spacetimePublicUri'

export const Route = createFileRoute('/api/spacetime/token')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const instance = app()
        if (!process.env.SPACETIME_DATABASE) return new Response(null, { status: 404 })
        const battle = new URL(request.url).searchParams.get('battle')
        const viewerId = await currentUserId(request)
        if (!viewerId) return new Response('Sign in required', { status: 401 })
        const battleId = battle ? await instance.service.userBattleId(battle, viewerId) : null
        const token = await instance.spacetimeToken(request.headers)
        return Response.json(
          { token, database: process.env.SPACETIME_DATABASE, uri: spacetimePublicUri(process.env.APP_URL), battleId },
          { headers: { 'cache-control': 'no-store' } },
        )
      },
    },
  },
})

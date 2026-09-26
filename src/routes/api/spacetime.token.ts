import { createFileRoute } from '@tanstack/react-router'
import { app } from '../../server/app'
import { currentUser } from '../../server/playerSession'

export const Route = createFileRoute('/api/spacetime/token')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const instance = app()
        if (!instance.spacetimeToken || !process.env.SPACETIME_DATABASE) return new Response(null, { status: 404 })
        const user = await currentUser(request)
        if (!user) return new Response('Sign in required', { status: 401 })
        const battle = new URL(request.url).searchParams.get('battle')
        const battleId = battle ? await instance.service.userBattleId(battle, user.id) : null
        const token = await instance.spacetimeToken(request.headers)
        return Response.json(
          { token, database: process.env.SPACETIME_DATABASE, uri: new URL('/spacetime/', request.url).toString(), battleId },
          { headers: { 'cache-control': 'no-store' } },
        )
      },
    },
  },
})

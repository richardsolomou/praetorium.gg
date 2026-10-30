import { createFileRoute } from '@tanstack/react-router'
import { app } from '../../server/app'
import { heldGuestSeat } from '../../server/guestSession'
import { currentUserId } from '../../server/playerSession'
import { guestDeviceHash } from '../../server/service'
import { spacetimePublicUri } from '../../server/spacetimePublicUri'

export const Route = createFileRoute('/api/spacetime/token')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const instance = app()
        if (!instance.spacetimeToken || !process.env.SPACETIME_DATABASE) return new Response(null, { status: 404 })
        const battle = new URL(request.url).searchParams.get('battle')
        // Like every battle read, the seat this device holds comes before the account, and only in its own battle.
        const guest = battle ? await heldGuestSeat(battle) : null
        const viewerId = guest?.seat ?? (await currentUserId(request))
        if (!viewerId) return new Response('Sign in required', { status: 401 })
        const battleId = battle ? await instance.service.userBattleId(battle, viewerId) : null
        const token = guest
          ? await instance.spacetimeGuestToken(guest.seat, guestDeviceHash(guest.secret))
          : await instance.spacetimeToken(request.headers)
        return Response.json(
          { token, database: process.env.SPACETIME_DATABASE, uri: spacetimePublicUri(process.env.APP_URL), battleId },
          { headers: { 'cache-control': 'no-store' } },
        )
      },
    },
  },
})

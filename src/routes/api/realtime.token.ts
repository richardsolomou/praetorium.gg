import { createFileRoute } from '@tanstack/react-router'
import { z } from 'zod'
import { app } from '../../server/app'
import { currentUser } from '../../server/playerSession'
import { battleChannel, connectionToken, realtimeConfig, subscriptionToken, userChannel } from '../../adapters/realtime'

/**
 * What a browser needs to watch a battle: who it is, and permission for one
 * channel.
 *
 * The seat is checked here and nowhere else, which is what stops a leaked invite
 * link buying a stream. A GET proves the connection; a POST naming a channel
 * authorises that battle in particular.
 */
export const Route = createFileRoute('/api/realtime/token')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const user = await currentUser(request)
        if (!user) return unauthorised()
        const { secret } = realtimeConfig()
        if (!secret) return new Response('realtime is not configured', { status: 503 })
        // Naming no battle asks for the user's own channel, which carries nothing but
        // "your battles moved" and needs no seat to justify it.
        if (!new URL(request.url).searchParams.get('battle')) {
          return Response.json({ token: await connectionToken(user.id, secret), channel: userChannel(user.id) })
        }
        const battleId = await seatedBattleId(request, user.id)
        if (battleId instanceof Response) return battleId
        // The channel is named after the battle rather than the invite token, so
        // the link that gets shared never becomes a channel name.
        return Response.json({ token: await connectionToken(user.id, secret), channel: battleChannel(battleId) })
      },
      POST: async ({ request }) => {
        const user = await currentUser(request)
        if (!user) return unauthorised()
        const { secret } = realtimeConfig()
        if (!secret) return new Response('realtime is not configured', { status: 503 })

        const asked = z.object({ channel: z.string() }).safeParse(await request.json())
        if (!asked.success) return new Response('channel required', { status: 400 })
        const { channel } = asked.data

        // Your own channel is yours by definition; anyone else's is not.
        if (channel.startsWith('user:')) {
          if (channel !== userChannel(user.id)) return new Response('not your channel', { status: 403 })
          return Response.json({ token: await subscriptionToken(user, channel, secret) })
        }

        const battleId = await seatedBattleId(request, user.id)
        if (battleId instanceof Response) return battleId
        if (channel !== battleChannel(battleId)) return new Response('not your channel', { status: 403 })

        return Response.json({ token: await subscriptionToken(user, channel, secret) })
      },
    },
  },
})

const unauthorised = () => new Response('sign in first', { status: 401 })

/** The battle this request names, if the player holds a seat in it. */
async function seatedBattleId(request: Request, userId: string) {
  const token = new URL(request.url).searchParams.get('battle')
  if (!token) return new Response('battle required', { status: 400 })
  try {
    return await app().service.userBattleId(token, userId)
  } catch (error) {
    if (error instanceof Response) return error
    throw error
  }
}

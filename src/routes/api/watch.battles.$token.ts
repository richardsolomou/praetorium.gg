import { createFileRoute } from '@tanstack/react-router'
import { tokenSchema } from '../../contracts/schemas'
import { watchLive } from '../../contracts/watchBattle'
import { app } from '../../server/app'

const headers = { 'Cache-Control': 'no-store' }

/** The score and clock a watch polls while the phone is away, open to anyone who may watch the battle. */
export const Route = createFileRoute('/api/watch/battles/$token')({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const parsed = tokenSchema.safeParse({ token: params.token })
        const battle = parsed.success ? await app().service.liveBattle(parsed.data.token) : null
        if (!battle) return new Response('no such battle', { status: 404, headers })
        return Response.json(watchLive(battle.view, battle.clock, Date.now()), { headers })
      },
    },
  },
})

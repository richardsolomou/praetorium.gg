import { createFileRoute } from '@tanstack/react-router'
import { app } from '../../server/app'
import { StreamLimiter } from '../../server/connections'

const HEARTBEAT_MS = 20_000

const limiter = new StreamLimiter()

const noop = () => {}

/**
 * One stream per open battle page. A message says only "this battle changed"; the
 * page then refetches through the normal read path, so nothing here decides what
 * a player may see. Seated players only, so a leaked link buys no stream.
 */
export const Route = createFileRoute('/api/events')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const token = new URL(request.url).searchParams.get('battle')
        if (!token) return new Response('battle required', { status: 400 })

        const session = await app().auth.api.getSession({ headers: request.headers })
        if (!session) return new Response('sign in first', { status: 401 })
        const viewer = app().service.playerForUser(session.user.id, session.user.name)

        let battleId: string
        let name: string
        try {
          battleId = app().service.playerBattleId(token, viewer)
          name = app().service.player(viewer)?.name ?? 'Someone'
        } catch (error) {
          if (error instanceof Response) return error
          throw error
        }

        const release = limiter.enter(viewer)
        if (!release) return new Response('too many open streams', { status: 429 })

        const encoder = new TextEncoder()
        let unsubscribe = noop
        let heartbeat: ReturnType<typeof setInterval>
        let closed = false
        const cleanup = () => {
          if (closed) return
          closed = true
          unsubscribe()
          clearInterval(heartbeat)
          release()
        }

        const stream = new ReadableStream({
          start(controller) {
            const push = (chunk: string) => {
              if (closed) return
              try {
                controller.enqueue(encoder.encode(chunk))
              } catch {
                cleanup()
              }
            }
            push('retry: 2000\n\n')
            const unsubscribeChanges = app().events.subscribe(battleId, () => push('event: change\ndata: 1\n\n'))
            // Presence is the set of open streams, so arriving and leaving is this
            // stream opening and closing — there is nothing to time out.
            const leave = app().presence.arrive(battleId, { playerId: viewer, name }, (present) =>
              push(`event: presence\ndata: ${JSON.stringify(present)}\n\n`),
            )
            unsubscribe = () => {
              unsubscribeChanges()
              leave()
            }
            // Proxies drop a stream that goes quiet, and the browser reconnects on
            // silence too, so say something well inside either timeout.
            heartbeat = setInterval(() => push(': keepalive\n\n'), HEARTBEAT_MS)
          },
          cancel: cleanup,
        })
        request.signal.addEventListener('abort', cleanup, { once: true })

        return new Response(stream, {
          headers: {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache, no-transform',
            Connection: 'keep-alive',
            'X-Accel-Buffering': 'no',
          },
        })
      },
    },
  },
})

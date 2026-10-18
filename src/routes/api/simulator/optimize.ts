import { createFileRoute } from '@tanstack/react-router'
import { app } from '../../../server/app'
import { combatLoadoutCandidates } from '../../../shared/combatLoadouts'
import { requireMutationOrigin } from '../../../server/mutationOrigin'
import { combatLoadoutSchema } from '../../../contracts/schemas'
import { boundedText } from '../../../server/boundedBody'

/**
 * Searches this instance runs at once. Each holds up to its retained-key limit in memory and shares the event loop
 * with every other request; devices with the download search for themselves.
 */
const MAX_SEARCHES = 2
/** The most a saved roster's picks may hold, which bounds a loadout drawn from one. */
const MAX_BODY_BYTES = 1_000_000
let searches = 0

export const Route = createFileRoute('/api/simulator/optimize')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        requireMutationOrigin(request)
        const body = await boundedText(request, MAX_BODY_BYTES)
          .then((text) => (text === null ? null : (JSON.parse(text) as unknown)))
          .catch(() => null)
        const parsed = combatLoadoutSchema.safeParse(body)
        if (!parsed.success) return new Response('Invalid loadout', { status: 400 })
        const loaded = await app().catalogueFor(parsed.data.catalogueId)
        if (!loaded) return new Response('The loadout could not be loaded.', { status: 503 })
        const rules = await app().rulesFor(parsed.data.catalogueId)
        if (searches >= MAX_SEARCHES) return new Response('Loadout searches are busy. Try again shortly.', { status: 503 })
        searches++
        const controller = new AbortController()
        const abort = () => controller.abort()
        if (request.signal.aborted) abort()
        else request.signal.addEventListener('abort', abort, { once: true })
        let finished = false
        const cleanup = () => {
          request.signal.removeEventListener('abort', abort)
          if (!finished) searches--
          finished = true
        }
        const batches = combatLoadoutCandidates(loaded, parsed.data, controller.signal, rules)
        const encoder = new TextEncoder()
        const stream = new ReadableStream<Uint8Array>({
          async pull(output) {
            try {
              const next = await batches.next()
              if (next.done) {
                cleanup()
                output.close()
              } else output.enqueue(encoder.encode(`${JSON.stringify(next.value)}\n`))
            } catch (error) {
              cleanup()
              output.enqueue(
                encoder.encode(`${JSON.stringify({ error: error instanceof Error ? error.message : 'Optimization failed.' })}\n`),
              )
              output.close()
            }
          },
          async cancel() {
            cleanup()
            controller.abort()
            await batches.return(undefined)
          },
        })
        return new Response(stream, { headers: { 'content-type': 'application/x-ndjson', 'cache-control': 'no-store' } })
      },
    },
  },
})

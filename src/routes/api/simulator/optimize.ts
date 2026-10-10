import { createFileRoute } from '@tanstack/react-router'
import { app } from '../../../server/app'
import { combatLoadoutCandidates } from '../../../server/combatLoadouts'
import { requireMutationOrigin } from '../../../server/mutationOrigin'
import { combatLoadoutSchema } from '../../../server/schemas'

export const Route = createFileRoute('/api/simulator/optimize')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        requireMutationOrigin(request)
        const parsed = combatLoadoutSchema.safeParse(await request.json().catch(() => null))
        if (!parsed.success) return new Response('Invalid loadout', { status: 400 })
        const loaded = await app().catalogueFor(parsed.data.catalogueId)
        if (!loaded) return new Response('The loadout could not be loaded.', { status: 503 })
        const controller = new AbortController()
        const abort = () => controller.abort()
        if (request.signal.aborted) abort()
        else request.signal.addEventListener('abort', abort, { once: true })
        const cleanup = () => request.signal.removeEventListener('abort', abort)
        const batches = combatLoadoutCandidates(loaded, parsed.data, controller.signal, await app().rulesFor(parsed.data.catalogueId))
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

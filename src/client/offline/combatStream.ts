import { combatLoadoutCandidates } from '../../shared/combatLoadouts'
import { combatLoadoutSchema } from '../../contracts/schemas'
import { localConstruction } from './construction'

export function localCombatStream(input: unknown, signal: AbortSignal): Response | null {
  const local = localConstruction()
  if (!local) return null
  const batches = combatLoadoutCandidates(local.catalogue, combatLoadoutSchema.parse(input), signal, local.rules)
  const encoder = new TextEncoder()
  const stream = new ReadableStream<Uint8Array>({
    async pull(output) {
      try {
        signal.throwIfAborted()
        const next = await batches.next()
        if (next.done) output.close()
        else output.enqueue(encoder.encode(`${JSON.stringify(next.value)}\n`))
      } catch (error) {
        output.error(error)
      }
    },
    async cancel() {
      await batches.return(undefined)
    },
  })
  return new Response(stream, { headers: { 'content-type': 'application/x-ndjson' } })
}

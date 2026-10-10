import CombatDiscoveryWorker from './combatDiscoveryWorker'
import type { CombatDiscoveryRequest, CombatDiscoveryAnswer } from './combatDiscovery'
import { referenceData } from './runtime'

export function localCombatStream(input: unknown, signal: AbortSignal): Response | null {
  const construction = referenceData()?.construction
  if (!construction) return null
  const worker = new CombatDiscoveryWorker()
  const encoder = new TextEncoder()
  let started = false
  let stopped = false
  let rejectPending: ((error: unknown) => void) | undefined
  const stop = () => {
    stopped = true
    worker.terminate()
    signal.removeEventListener('abort', abort)
    rejectPending?.(signal.reason ?? new Error('Optimization cancelled.'))
    rejectPending = undefined
  }
  let abort: () => void
  const stream = new ReadableStream<Uint8Array>({
    start(output) {
      abort = () => {
        stop()
        output.error(signal.reason)
      }
      signal.addEventListener('abort', abort, { once: true })
      if (signal.aborted) abort()
    },
    async pull(output) {
      try {
        signal.throwIfAborted()
        const next = await new Promise<CombatDiscoveryAnswer>((resolve, reject) => {
          rejectPending = reject
          worker.onmessage = (event: MessageEvent<CombatDiscoveryAnswer>) => {
            rejectPending = undefined
            resolve(event.data)
          }
          worker.onerror = () => reject(new Error('Optimization failed. Try again.'))
          worker.onmessageerror = () => reject(new Error('The loadout search could not be read.'))
          worker.postMessage((started ? { kind: 'next' } : { kind: 'start', construction, input }) satisfies CombatDiscoveryRequest)
          started = true
        })
        if (stopped) return
        if ('error' in next) throw new Error(next.error)
        if ('done' in next) {
          stop()
          output.close()
        } else output.enqueue(encoder.encode(`${JSON.stringify(next.batch)}\n`))
      } catch (error) {
        if (!stopped) {
          stop()
          output.error(error)
        }
      }
    },
    cancel: stop,
  })
  return new Response(stream, { headers: { 'content-type': 'application/x-ndjson' } })
}

import { calculateCombatBatch } from '../../functions'
import { anySignal } from '../../abortSignals'
import { CombatAnswerCache } from '../../../shared/combatAnswerCache'
import type { CombatAnswer, CombatRequest } from '../../../core/combatMatchup'
import CombatWorker from './combatWorker'

const combatAnswerCache = new CombatAnswerCache(8 * 1024 * 1024)
export const clearCombatAnswerCache = () => combatAnswerCache.clear()

function localCombatCalculator(onFailure: () => void) {
  let worker: Worker | undefined
  const dispose = () => {
    worker?.terminate()
    worker = undefined
  }
  const calculate = (request: CombatRequest, signal: AbortSignal): Promise<CombatAnswer> => {
    signal.throwIfAborted()
    if (!request.ranged && !request.melee) return Promise.resolve({ ranged: null, melee: null })
    return new Promise((resolve, reject) => {
      let active = true
      let timer: ReturnType<typeof setTimeout> | undefined
      const stop = () => {
        if (!active) return
        active = false
        clearTimeout(timer)
        if (worker) {
          worker.onmessage = null
          worker.onerror = null
          worker.onmessageerror = null
        }
        signal.removeEventListener('abort', abort)
      }
      const fail = (message: string) => {
        if (!active) return
        stop()
        dispose()
        onFailure()
        resolve({
          ranged: request.ranged ? { error: message } : null,
          melee: request.melee ? { error: message } : null,
          combined: { error: message },
        })
      }
      const abort = () => {
        stop()
        dispose()
        reject(signal.reason)
      }
      signal.addEventListener('abort', abort, { once: true })
      try {
        worker ??= new CombatWorker()
        worker.onmessage = (event: MessageEvent<CombatAnswer>) => {
          if (!active) return
          stop()
          resolve(event.data)
        }
        worker.onerror = () => fail('The calculation failed. Try again.')
        worker.onmessageerror = () => fail('The calculation response could not be read. Try again.')
        timer = setTimeout(() => fail('The calculation took too long. Try a smaller matchup.'), 15_000)
        worker.postMessage(request)
      } catch {
        fail('The calculation could not start. This browser must support Web Workers.')
      }
    })
  }
  return { calculate, dispose }
}

export const readCombatAnswer = (request: CombatRequest) => combatAnswerCache.read(request)

export function combatCalculator() {
  let failed = false
  const local = localCombatCalculator(() => {
    failed = true
  })
  let online = typeof window !== 'undefined' && navigator.onLine
  return {
    get failed() {
      return failed
    },
    dispose: local.dispose,
    calculate: async (requests: CombatRequest[], signal: AbortSignal): Promise<CombatAnswer[]> => {
      signal.throwIfAborted()
      const hits = requests.map((request) => combatAnswerCache.read(request))
      const missing = requests.filter((_, index) => !hits[index])
      if (!missing.length) return hits as CombatAnswer[]
      let fresh: CombatAnswer[] | undefined
      if (online && navigator.onLine) {
        const timeout = new AbortController()
        const timer = setTimeout(() => timeout.abort(new Error('Calculation request timed out.')), 16_000)
        try {
          fresh = await calculateCombatBatch({ data: missing, signal: anySignal([signal, timeout.signal]) })
        } catch {
          signal.throwIfAborted()
          online = false
        } finally {
          clearTimeout(timer)
        }
      }
      if (!fresh) {
        fresh = []
        for (const request of missing) fresh.push(await local.calculate(request, signal))
      }
      signal.throwIfAborted()
      let next = 0
      return requests.map((request, index) => {
        if (hits[index]) return hits[index]
        const answer = fresh[next++]!
        combatAnswerCache.write(request, answer)
        return answer
      })
    },
  }
}

export async function calculateCombatPair(request: CombatRequest, signal: AbortSignal): Promise<CombatAnswer> {
  const calculator = combatCalculator()
  try {
    return (await calculator.calculate([request], signal))[0]!
  } finally {
    calculator.dispose()
  }
}

import { calculateCombatBatch } from '../../functions'
import { withTimeout } from '../../abortSignals'
import { CombatAnswerCache } from '../../../shared/combatAnswerCache'
import type { CombatAnswer, CombatRequest } from '../../../core/combatMatchup'
import CombatWorker from './combatWorker'
import { WorkerFailure, workerAnswer } from '../../workerAnswer'

const combatAnswerCache = new CombatAnswerCache(8 * 1024 * 1024)
export const clearCombatAnswerCache = () => combatAnswerCache.clear()

function localCombatCalculator(onFailure: () => void) {
  let worker: Worker | undefined
  const dispose = () => {
    worker?.terminate()
    worker = undefined
  }
  const failed = (request: CombatRequest, message: string): CombatAnswer => {
    dispose()
    onFailure()
    return {
      ranged: request.ranged ? { error: message } : null,
      melee: request.melee ? { error: message } : null,
      combined: { error: message },
    }
  }
  const answer = async (request: CombatRequest, signal: AbortSignal): Promise<CombatAnswer> => {
    try {
      worker ??= new CombatWorker()
      return await workerAnswer<CombatAnswer>(worker, request, { timeoutMs: 15_000, signal })
    } catch (error) {
      if (signal.aborted) {
        dispose()
        throw signal.reason
      }
      if (!(error instanceof WorkerFailure))
        return failed(request, 'The calculation could not start. This browser must support Web Workers.')
      if (error.reason === 'timeout') return failed(request, 'The calculation took too long. Try a smaller matchup.')
      if (error.reason === 'unreadable') return failed(request, 'The calculation response could not be read. Try again.')
      return failed(request, 'The calculation failed. Try again.')
    }
  }
  const calculate = (request: CombatRequest, signal: AbortSignal): Promise<CombatAnswer> => {
    signal.throwIfAborted()
    if (!request.ranged && !request.melee) return Promise.resolve({ ranged: null, melee: null })
    return answer(request, signal)
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
        try {
          fresh = await calculateCombatBatch({ data: missing, signal: withTimeout(signal, 16_000) })
        } catch {
          signal.throwIfAborted()
          online = false
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

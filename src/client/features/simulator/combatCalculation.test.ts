import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { calculateCombatPair, clearCombatAnswerCache, combatCalculator } from './combatCalculation'
import { DEFAULT_COMBAT_OPTIONS } from '../../../core/combat'
import { resolveCombatRequest, type CombatAnswer, type CombatRequest } from '../../../core/combatMatchup'

const mocks = vi.hoisted(() => ({ server: vi.fn(), worker: vi.fn() }))
vi.mock('../../functions', () => ({ calculateCombatBatch: mocks.server }))
vi.mock('./combatWorker', () => ({
  default: function () {
    return mocks.worker()
  },
}))
function failure(pending: Promise<unknown>, message: string) {
  return pending.then(
    () => expect.fail('Expected rejection'),
    (error: Error) => expect(error.message).toContain(message),
  )
}

const request = (damage = 0): CombatRequest => ({
  ranged: {
    weapons: [],
    options: DEFAULT_COMBAT_OPTIONS,
    target: {
      groups: [{ models: 1, toughness: 4, wounds: 2, save: 3, invulnerable: null }],
      feelNoPain: null,
      damage,
    },
  },
  melee: null,
})
function worker() {
  const current = {
    onmessage: null as ((event: MessageEvent<CombatAnswer>) => void) | null,
    onerror: null as (() => void) | null,
    onmessageerror: null as (() => void) | null,
    terminate: vi.fn(),
    postMessage: vi.fn(),
  }
  current.postMessage.mockImplementation((input: CombatRequest) =>
    queueMicrotask(() => current.onmessage?.({ data: resolveCombatRequest(input) } as MessageEvent<CombatAnswer>)),
  )
  return current
}
beforeEach(() => {
  clearCombatAnswerCache()
  vi.stubGlobal('window', {})
  vi.stubGlobal('navigator', { onLine: true })
  mocks.server
    .mockReset()
    .mockImplementation(({ data }: { data: CombatRequest[] }) => Promise.resolve(data.map((input) => resolveCombatRequest(input))))
  mocks.worker.mockReset().mockImplementation(worker)
})
afterEach(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

it('uses the server for a connected estimate without starting a browser worker', async () => {
  expect(await calculateCombatPair(request(), new AbortController().signal)).toEqual(resolveCombatRequest(request()))
  expect({ calls: mocks.server.mock.calls.length, workers: mocks.worker.mock.calls.length }).toEqual({ calls: 1, workers: 0 })
})

it('shares pair answers between unit and batched callers', async () => {
  await calculateCombatPair(request(), new AbortController().signal)
  const calculator = combatCalculator()
  try {
    const results = await calculator.calculate([request(), request(1)], new AbortController().signal)
    expect(mocks.server.mock.calls.map(([args]) => args.data)).toEqual([[request()], [request(1)]])
    expect(results).toEqual([resolveCombatRequest(request()), resolveCombatRequest(request(1))])
  } finally {
    calculator.dispose()
  }
})

it('reuses one local worker for an offline batch', async () => {
  vi.stubGlobal('navigator', { onLine: false })
  const calculator = combatCalculator()
  try {
    expect(await calculator.calculate([request(), request(1)], new AbortController().signal)).toEqual([
      resolveCombatRequest(request()),
      resolveCombatRequest(request(1)),
    ])
    expect({ workers: mocks.worker.mock.calls.length, server: mocks.server.mock.calls.length }).toEqual({ workers: 1, server: 0 })
  } finally {
    calculator.dispose()
  }
  expect(mocks.worker.mock.results[0]!.value.terminate).toHaveBeenCalledOnce()
})

it('falls back locally after server failure and avoids repeating failed requests in the same run', async () => {
  mocks.server.mockRejectedValue(new Error('Busy'))
  const calculator = combatCalculator()
  try {
    await calculator.calculate([request()], new AbortController().signal)
    expect(await calculator.calculate([request(1)], new AbortController().signal)).toEqual([resolveCombatRequest(request(1))])
    expect(mocks.server).toHaveBeenCalledOnce()
  } finally {
    calculator.dispose()
  }
})

it('falls back locally when the server request times out', async () => {
  const deadline = new AbortController()
  const timeout = vi.spyOn(AbortSignal, 'timeout').mockReturnValue(deadline.signal)
  try {
    mocks.server.mockImplementation(
      ({ signal }: { signal: AbortSignal }) => new Promise((_, reject) => signal.addEventListener('abort', () => reject(signal.reason))),
    )
    const pending = calculateCombatPair(request(), new AbortController().signal)
    deadline.abort(new DOMException('The operation timed out.', 'TimeoutError'))
    expect(await pending).toEqual(resolveCombatRequest(request()))
  } finally {
    timeout.mockRestore()
  }
})

it('cancels a server request without starting local work or caching its late answer', async () => {
  let finish!: (answers: CombatAnswer[]) => void
  mocks.server.mockImplementation(
    () =>
      new Promise<CombatAnswer[]>((resolve) => {
        finish = resolve
      }),
  )
  const controller = new AbortController()
  const pending = calculateCombatPair(request(), controller.signal)
  const rejected = failure(pending, 'Cancelled')
  controller.abort(new Error('Cancelled'))
  finish([resolveCombatRequest(request())])
  await rejected
  expect(mocks.worker).not.toHaveBeenCalled()
  mocks.server.mockImplementation(({ data }: { data: CombatRequest[] }) =>
    Promise.resolve(data.map((input) => resolveCombatRequest(input))),
  )
  await calculateCombatPair(request(), new AbortController().signal)
  expect(mocks.server).toHaveBeenCalledTimes(2)
})

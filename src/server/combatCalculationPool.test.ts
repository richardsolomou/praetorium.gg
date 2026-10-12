import { EventEmitter } from 'node:events'
import type { Worker } from 'node:worker_threads'
import { afterEach, expect, it, vi } from 'vitest'
import { CombatCalculationPool } from './combatCalculationPool'
import type { CombatAnswer, CombatRequest } from '../core/combatMatchup'

const answer: CombatAnswer = { ranged: { result: { kills: [1], damage: [1], meanKills: 0, meanDamage: 0, wipe: 0 } }, melee: null }
function failure(pending: Promise<unknown>, message: string) {
  return pending.then(
    () => expect.fail('Expected rejection'),
    (error: Error) => expect(error.message).toContain(message),
  )
}

const request = (sequenceError = 'one') => ({ ranged: null, melee: null, sequenceError }) satisfies CombatRequest
const pools: CombatCalculationPool[] = []

it('shares the request pool with separately loaded shutdown code', async () => {
  const first = await import('./combatCalculationPool')
  vi.resetModules()
  const second = await import('./combatCalculationPool')
  expect(second.combatCalculationPool).toBe(first.combatCalculationPool)
})
function setup(concurrency = 2, maxPending = 64) {
  const workers: (EventEmitter & { postMessage: ReturnType<typeof vi.fn>; terminate: ReturnType<typeof vi.fn> })[] = []
  const create = vi.fn(() => {
    const worker = Object.assign(new EventEmitter(), {
      postMessage: vi.fn(),
      terminate: vi.fn(async () => 0),
      ref: vi.fn(),
      unref: vi.fn(),
    })
    workers.push(worker)
    return worker as unknown as Worker
  })
  const pool = new CombatCalculationPool(create, concurrency, maxPending)
  pools.push(pool)
  const calculate = (input = request(), signal = new AbortController().signal) => pool.calculate(input, signal)
  return { pool, workers, create, calculate }
}
afterEach(async () => {
  await Promise.all(pools.splice(0).map((pool) => pool.close()))
  vi.useRealTimers()
})

it('bounds concurrency and reuses a worker for queued calculations', async () => {
  const run = setup()
  const pending = [run.calculate(request('a')), run.calculate(request('b')), run.calculate(request('c'))]
  expect(run.workers).toHaveLength(2)
  run.workers[1]!.emit('message', answer)
  expect(run.workers[1]!.postMessage.mock.calls).toEqual([[request('b')], [request('c')]])
  run.workers[0]!.emit('message', answer)
  run.workers[1]!.emit('message', answer)
  expect(await Promise.all(pending)).toEqual([answer, answer, answer])
})

it('shares completed answers across callers without posting another job', async () => {
  const run = setup()
  const first = run.calculate()
  run.workers[0]!.emit('message', structuredClone(answer))
  const result = await first
  result.ranged!.result!.meanDamage = 99
  expect(await run.calculate()).toEqual(answer)
  expect(run.workers[0]!.postMessage).toHaveBeenCalledOnce()
})

it('does not cache calculation errors', async () => {
  const run = setup()
  const first = run.calculate()
  run.workers[0]!.emit('message', { ranged: { error: 'Too large' }, melee: null })
  await first
  const second = run.calculate()
  expect(run.workers[0]!.postMessage).toHaveBeenCalledTimes(2)
  run.workers[0]!.emit('message', answer)
  await second
})

it('rejects excess work without creating more workers', async () => {
  const run = setup(1, 1)
  const first = run.calculate()
  await failure(run.calculate(request('other')), 'busy')
  expect(run.workers).toHaveLength(1)
  run.workers[0]!.emit('message', answer)
  await first
})

it('removes cancelled queued work without disturbing the active caller', async () => {
  const run = setup(1)
  const first = run.calculate()
  const controller = new AbortController()
  const second = run.calculate(request('other'), controller.signal)
  const rejected = failure(second, 'Cancelled')
  controller.abort(new Error('Cancelled'))
  await rejected
  run.workers[0]!.emit('message', answer)
  await first
  expect(run.workers[0]!.postMessage).toHaveBeenCalledOnce()
})

it('waits for cancelled worker termination before creating a replacement', async () => {
  const run = setup(1)
  const controller = new AbortController()
  const first = run.calculate(request(), controller.signal)
  let terminate!: () => void
  run.workers[0]!.terminate.mockImplementation(
    () =>
      new Promise<void>((resolve) => {
        terminate = resolve
      }),
  )
  const rejected = failure(first, 'Cancelled')
  controller.abort(new Error('Cancelled'))
  await rejected
  const second = run.calculate(request('other'))
  expect(run.workers).toHaveLength(1)
  terminate()
  await vi.waitFor(() => expect(run.workers).toHaveLength(2))
  run.workers[1]!.emit('message', answer)
  await second
})

it('times out queued and active work and frees capacity', async () => {
  vi.useFakeTimers()
  const run = setup(1)
  const first = failure(run.calculate(), 'too long')
  const second = failure(run.calculate(request('other')), 'too long')
  await vi.advanceTimersByTimeAsync(15_000)
  await Promise.all([first, second])
  const third = run.calculate(request('retry'))
  run.workers.at(-1)!.emit('message', answer)
  expect(await third).toEqual(answer)
})

it.each(['error', 'exit', 'messageerror'])('recovers after worker %s', async (event) => {
  const run = setup(1)
  const first = failure(run.calculate(), 'worker stopped')
  run.workers[0]!.emit(event, event === 'error' ? new Error('Failed') : 1)
  await first
  const second = run.calculate(request('retry'))
  await vi.waitFor(() => expect(run.workers).toHaveLength(2))
  run.workers[1]!.emit('message', answer)
  expect(await second).toEqual(answer)
})

it('rejects active and queued callers on shutdown and refuses new work', async () => {
  const run = setup(1)
  const first = failure(run.calculate(), 'stopping')
  const second = failure(run.calculate(request('other')), 'stopping')
  await run.pool.close()
  await Promise.all([first, second])
  await failure(run.calculate(), 'stopping')
  expect(run.workers[0]!.terminate).toHaveBeenCalledOnce()
})

it('recovers from startup and posting failures', async () => {
  const run = setup(1)
  run.create.mockImplementationOnce(() => {
    throw new Error('Startup failed')
  })
  await failure(run.calculate(), 'Startup failed')
  const first = run.calculate()
  run.workers[0]!.emit('message', answer)
  await first
  run.workers[0]!.postMessage.mockImplementationOnce(() => {
    throw new Error('Post failed')
  })
  await failure(run.calculate(request('other')), 'Post failed')
  const second = run.calculate(request('retry'))
  await vi.waitFor(() => expect(run.workers).toHaveLength(2))
  run.workers[1]!.emit('message', answer)
  expect(await second).toEqual(answer)
})

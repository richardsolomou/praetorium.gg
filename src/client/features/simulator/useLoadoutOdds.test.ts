import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import type { LoadoutScoring } from '../../../core/combatLoadouts'
import { useLoadoutOdds, type LoadoutOdds } from './useLoadoutOdds'

const hooks = vi.hoisted(() => ({
  cursor: 0,
  effectCursor: 0,
  states: [] as unknown[],
  effects: [] as (() => void | (() => void))[],
  dependencies: [] as (readonly unknown[])[],
  createWorker: vi.fn(),
}))

vi.mock('react', () => ({
  useEffect: (effect: () => void | (() => void), dependencies: readonly unknown[]) => {
    const index = hooks.effectCursor++
    const previous = hooks.dependencies[index]
    if (!previous || dependencies.some((value, at) => !Object.is(value, previous[at]))) {
      hooks.dependencies[index] = dependencies
      hooks.effects.push(effect)
    }
  },
  useCallback: (callback: unknown) => callback,
  useState: (initial: unknown) => {
    const index = hooks.cursor++
    if (!(index in hooks.states)) hooks.states[index] = initial
    return [
      hooks.states[index],
      (next: unknown) => {
        hooks.states[index] = typeof next === 'function' ? next(hooks.states[index]) : next
      },
    ]
  },
}))
vi.mock('./combatWorker', () => ({
  default: function CombatWorker() {
    return hooks.createWorker()
  },
}))

function worker() {
  return {
    onmessage: null as ((event: MessageEvent<LoadoutOdds>) => void) | null,
    onerror: null as (() => void) | null,
    onmessageerror: null as (() => void) | null,
    postMessage: vi.fn(),
    terminate: vi.fn(),
  }
}

const scoring = {
  sheet: { name: 'Unit', profiles: [], keywords: [] },
  models: 1,
  rules: [],
  opponent: { keywords: [], rules: [] },
  preferences: {},
  excluded: { ranged: [], melee: [] },
  phases: { ranged: null, melee: null },
} as unknown as LoadoutScoring
const space = { carriers: [], weapons: [], choices: [] }
const expected = { ranged: null, melee: null }
const odds: LoadoutOdds = { estimates: new Map(), profiles: new Map() }

function render(models = 1, enabled = true) {
  hooks.cursor = 0
  hooks.effectCursor = 0
  hooks.effects = []
  const found = useLoadoutOdds({ space: enabled ? space : null, scoring: { ...scoring, models }, expected })
  const effect = hooks.effects[0]
  return { found, start: () => effect?.() }
}

beforeEach(() => {
  hooks.states = []
  hooks.dependencies = []
  hooks.createWorker.mockReset()
  vi.useFakeTimers()
})
afterEach(() => vi.useRealTimers())

/** Lets the worker's answer reach the hook, which hears it a few promise steps after the event. */
const settled = async () => {
  for (let step = 0; step < 5; step++) await Promise.resolve()
}

it('sends the current scoring request to its worker', async () => {
  const current = worker()
  hooks.createWorker.mockReturnValue(current)
  render().start()
  await settled()
  expect(current.postMessage).toHaveBeenCalledWith({ kind: 'loadouts', space, scoring, expected })
})

it('settles a worker constructor failure as a retryable error', async () => {
  hooks.createWorker.mockImplementation(() => {
    throw new Error('Worker unavailable')
  })
  render().start()
  await settled()
  expect(render().found).toMatchObject({ error: expect.stringContaining('could not start'), retry: expect.any(Function), updating: false })
})

it('settles a postMessage failure without throwing from the effect', async () => {
  const current = worker()
  current.postMessage.mockImplementation(() => {
    throw new Error('DataCloneError')
  })
  hooks.createWorker.mockReturnValue(current)
  await settled()
  expect(() => render().start()).not.toThrow()
})

it('terminates a worker whose request could not be posted', async () => {
  const current = worker()
  current.postMessage.mockImplementation(() => {
    throw new Error('DataCloneError')
  })
  hooks.createWorker.mockReturnValue(current)
  render().start()
  await settled()
  expect(current.terminate).toHaveBeenCalledOnce()
})

it('settles a worker execution error with a retry action', async () => {
  const current = worker()
  hooks.createWorker.mockReturnValue(current)
  render().start()
  current.onerror!()
  await settled()
  expect(render().found).toMatchObject({ error: expect.stringContaining('failed'), retry: expect.any(Function), updating: false })
})

it('settles an unreadable worker response with a retry action', async () => {
  const current = worker()
  hooks.createWorker.mockReturnValue(current)
  render().start()
  current.onmessageerror?.()
  await settled()
  expect(render().found).toMatchObject({ error: expect.stringContaining('failed'), retry: expect.any(Function), updating: false })
})

it('bounds an unresponsive worker and terminates it at the deadline', async () => {
  const current = worker()
  hooks.createWorker.mockReturnValue(current)
  render().start()
  vi.advanceTimersByTime(15_000)
  await settled()
  expect(current.terminate).toHaveBeenCalledOnce()
})

it('retries a timed out request and accepts its successful answer', async () => {
  const first = worker()
  const next = worker()
  hooks.createWorker.mockReturnValueOnce(first).mockReturnValueOnce(next)
  render().start()
  vi.advanceTimersByTime(15_000)
  await settled()
  const failed = render().found
  await settled()
  expect(failed?.retry).toBeTypeOf('function')
  failed!.retry!()
  render().start()
  await settled()
  expect(next.postMessage).toHaveBeenCalledOnce()
  next.onmessage!(new MessageEvent<LoadoutOdds>('message', { data: odds }))
  await settled()
  expect(render().found).toEqual(odds)
})

it('keeps a previous answer marked as updating during an edit', async () => {
  const first = worker()
  hooks.createWorker.mockReturnValue(first)
  render().start()
  first.onmessage?.(new MessageEvent<LoadoutOdds>('message', { data: odds }))
  await settled()
  expect(render(2).found).toEqual({ ...odds, updating: true })
})

it('cannot replace a newer answer with a callback from a cancelled worker', async () => {
  const first = worker()
  const next = worker()
  const newer = { estimates: new Map(), profiles: new Map(), updating: false }
  hooks.createWorker.mockReturnValueOnce(first).mockReturnValueOnce(next)
  const cancel = render().start()
  cancel!()
  render(2).start()
  next.onmessage!(new MessageEvent<LoadoutOdds>('message', { data: newer }))
  first.onmessage?.(new MessageEvent<LoadoutOdds>('message', { data: odds }))
  await settled()
  expect(render(2).found).toEqual(newer)
})

it('ignores an execution error from a cancelled request', async () => {
  const first = worker()
  const next = worker()
  hooks.createWorker.mockReturnValueOnce(first).mockReturnValueOnce(next)
  const cancel = render().start()
  cancel!()
  render(2).start()
  next.onmessage!(new MessageEvent<LoadoutOdds>('message', { data: odds }))
  first.onerror?.()
  await settled()
  expect(render(2).found).toEqual(odds)
})

it('does not expose a previous answer when alternative scoring is disabled', async () => {
  const current = worker()
  hooks.createWorker.mockReturnValue(current)
  render().start()
  current.onmessage!(new MessageEvent<LoadoutOdds>('message', { data: odds }))
  await settled()
  expect(render(1, false).found).toBeNull()
})

it('clears its deadline after receiving an answer', async () => {
  const current = worker()
  hooks.createWorker.mockReturnValue(current)
  render().start()
  current.onmessage!(new MessageEvent<LoadoutOdds>('message', { data: odds }))
  vi.advanceTimersByTime(15_000)
  await settled()
  expect(current.terminate).toHaveBeenCalledOnce()
})

it('keeps prior odds stale after an edited request fails', async () => {
  const first = worker()
  const next = worker()
  hooks.createWorker.mockReturnValueOnce(first).mockReturnValueOnce(next)
  const cancel = render().start()
  first.onmessage?.(new MessageEvent<LoadoutOdds>('message', { data: odds }))
  cancel!()
  render(2).start()
  next.onerror!()
  await settled()
  expect(render(2).found).toMatchObject({ ...odds, error: expect.stringContaining('failed'), updating: false })
})

it('does not leave a deadline running after cancellation', async () => {
  const current = worker()
  hooks.createWorker.mockReturnValue(current)
  const cancel = render().start()
  cancel!()
  await settled()
  expect(vi.getTimerCount()).toBe(0)
})

it('restarts a failed request without changing the selected loadouts', async () => {
  hooks.createWorker.mockImplementationOnce(() => {
    throw new Error('Worker unavailable')
  })
  hooks.createWorker.mockReturnValueOnce(worker())
  render().start()
  render().found!.retry!()
  render().start()
  await settled()
  expect(hooks.createWorker).toHaveBeenCalledTimes(2)
})

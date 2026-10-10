import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { localCombatStream } from './combatStream'
import type { CombatDiscoveryAnswer } from './combatDiscovery'

const mocks = vi.hoisted(() => ({
  reference: vi.fn(),
  requests: [] as unknown[],
  terminate: vi.fn(),
  worker: undefined as FakeWorker | undefined,
}))
class FakeWorker {
  onmessage?: (event: MessageEvent<CombatDiscoveryAnswer>) => void
  onerror?: () => void
  onmessageerror?: () => void
  constructor() {
    mocks.worker = this
  }
  postMessage(request: unknown) {
    mocks.requests.push(request)
  }
  terminate = mocks.terminate
  answer(data: CombatDiscoveryAnswer) {
    this.onmessage?.({ data } as MessageEvent<CombatDiscoveryAnswer>)
  }
}
vi.mock('./combatDiscoveryWorker', () => ({
  default: function () {
    return new FakeWorker()
  },
}))
vi.mock('./runtime', () => ({ referenceData: mocks.reference }))
beforeEach(() => {
  mocks.reference.mockReturnValue({ construction: { revision: 'saved' } })
  mocks.requests = []
  mocks.terminate.mockClear()
})
afterEach(() => vi.restoreAllMocks())

it('requests candidate batches from the worker only as the stream is consumed', async () => {
  const response = localCombatStream({ pickIndex: 0 }, new AbortController().signal)!
  const reader = response.body!.getReader()
  const reading = reader.read()
  await vi.waitFor(() => expect(mocks.requests).toHaveLength(1))
  mocks.worker!.answer({ batch: { candidates: [], built: 0, scheduled: 1, done: false } })
  const first = await reading
  const next = reader.read()
  await vi.waitFor(() => expect(mocks.requests).toHaveLength(2))
  mocks.worker!.answer({ done: true })
  const last = await next
  expect({
    first: new TextDecoder().decode(first.value),
    last,
    requests: mocks.requests,
    terminated: mocks.terminate.mock.calls.length,
  }).toEqual({
    first: '{"candidates":[],"built":0,"scheduled":1,"done":false}\n',
    last: { done: true, value: undefined },
    requests: [{ kind: 'start', construction: { revision: 'saved' }, input: { pickIndex: 0 } }, { kind: 'next' }],
    terminated: 1,
  })
})
it('terminates discovery immediately when an in-flight search is aborted', async () => {
  const controller = new AbortController()
  const reader = localCombatStream({}, controller.signal)!.body!.getReader()
  const reading = reader.read()
  controller.abort(new Error('Cancelled'))
  await expect(reading).rejects.toThrow('Cancelled')
  expect(mocks.terminate).toHaveBeenCalledOnce()
})
it('terminates discovery when the stream reader cancels', async () => {
  const reader = localCombatStream({}, new AbortController().signal)!.body!.getReader()
  await reader.cancel()
  expect(mocks.terminate).toHaveBeenCalledOnce()
})
it('surfaces a discovery error and releases its worker', async () => {
  const reader = localCombatStream({}, new AbortController().signal)!.body!.getReader()
  const reading = reader.read()
  await vi.waitFor(() => expect(mocks.requests).toHaveLength(1))
  mocks.worker!.answer({ error: 'Search limit reached' })
  await expect(reading).rejects.toThrow('Search limit reached')
  expect(mocks.terminate).toHaveBeenCalledOnce()
})
it.each([
  ['onerror', 'Optimization failed. Try again.'],
  ['onmessageerror', 'The loadout search could not be read.'],
] as const)('releases a failed discovery worker on %s', async (event, message) => {
  const reader = localCombatStream({}, new AbortController().signal)!.body!.getReader()
  const reading = reader.read()
  await vi.waitFor(() => expect(mocks.requests).toHaveLength(1))
  mocks.worker![event]!()
  await expect(reading).rejects.toThrow(message)
  expect(mocks.terminate).toHaveBeenCalledOnce()
})
it('uses the connected stream when construction data has not been downloaded', () => {
  mocks.reference.mockReturnValue(undefined)
  expect(localCombatStream({}, new AbortController().signal)).toBeNull()
})

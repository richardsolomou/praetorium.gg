import { afterEach, beforeEach, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  effects: [] as (() => void | (() => void))[],
  invalidateQueries: vi.fn(async () => {}),
  captureException: vi.fn(),
  sockets: [] as { connected?: (current: unknown) => void; failed?: (current: unknown, error: unknown) => void; applied?: () => void }[],
}))

vi.mock('react', () => ({
  useEffect: (effect: () => void | (() => void)) => mocks.effects.push(effect),
  useCallback: (callback: unknown) => callback,
  useState: () => [false, vi.fn()],
}))
vi.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({ invalidateQueries: mocks.invalidateQueries }),
}))
vi.mock('posthog-js', () => ({ posthog: { captureException: mocks.captureException } }))
vi.mock('./queries', () => ({
  battleQuery: (token: string) => ({ queryKey: ['battle', token] }),
  battlesQuery: () => ({ queryKey: ['battles'] }),
}))
vi.mock('../spacetime/generated', () => ({
  tables: {},
  DbConnection: {
    builder: () => {
      const socket: (typeof mocks.sockets)[number] = {}
      mocks.sockets.push(socket)
      const builder = {
        withUri: () => builder,
        withDatabaseName: () => builder,
        withToken: () => builder,
        onConnect: (callback: typeof socket.connected) => {
          socket.connected = callback
          return builder
        },
        onDisconnect: () => builder,
        onConnectError: (callback: typeof socket.failed) => {
          socket.failed = callback
          return builder
        },
        build: () => ({ disconnect: vi.fn() }),
      }
      return builder
    },
  },
}))

import { useSpacetimeLiveBattle, useSpacetimeLiveProduct } from './spacetimeLive'

let cleanups: (() => void)[] = []

beforeEach(() => {
  vi.useFakeTimers()
  vi.spyOn(Math, 'random').mockReturnValue(0)
  vi.spyOn(console, 'error').mockImplementation(() => {})
  vi.stubGlobal('window', { location: { origin: 'https://praetorium.gg' }, setInterval, clearInterval })
  mocks.effects.length = 0
  mocks.sockets.length = 0
  mocks.invalidateQueries.mockClear()
  mocks.captureException.mockClear()
})

afterEach(() => {
  for (const cleanup of cleanups) cleanup()
  cleanups = []
  vi.useRealTimers()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

function mount() {
  cleanups = mocks.effects.map((effect) => effect()).filter((cleanup): cleanup is () => void => typeof cleanup === 'function')
}

it.each([401, 403, 404, 429, 503])('rechecks authentication only for a refused signed-in ticket (HTTP %s)', async (status) => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response(null, { status })),
  )
  useSpacetimeLiveProduct({ mode: 'spacetime', database: 'test', uri: 'https://praetorium.gg/spacetime/' }, true)
  mount()
  await vi.advanceTimersByTimeAsync(0)
  expect(mocks.invalidateQueries.mock.calls).toEqual(status === 401 ? [[{ queryKey: ['me'] }]] : [])
})

it('does not recheck authentication or capture network failures on ticket retries', async () => {
  const fetch = vi.fn(async () => {
    throw new TypeError('Load failed')
  })
  vi.stubGlobal('fetch', fetch)
  useSpacetimeLiveProduct({ mode: 'spacetime', database: 'test', uri: 'https://praetorium.gg/spacetime/' }, true)
  mount()
  await vi.advanceTimersByTimeAsync(15_000)
  expect([fetch.mock.calls.length, mocks.invalidateQueries.mock.calls.length, mocks.captureException.mock.calls.length]).toEqual([3, 0, 0])
})

it.each(['product', 'battle'] as const)('recovers a %s subscription after socket errors without capturing raw events', async (surface) => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () =>
      Response.json({
        token: 'ticket',
        database: 'test',
        uri: 'https://praetorium.gg/spacetime/',
        battleId: 'battle-id',
      }),
    ),
  )
  if (surface === 'product') {
    useSpacetimeLiveProduct({ mode: 'spacetime', database: 'test', uri: 'https://praetorium.gg/spacetime/' }, false)
  } else {
    useSpacetimeLiveBattle('battle-token', true)
  }
  mount()
  await vi.advanceTimersByTimeAsync(0)
  mocks.sockets[0]!.failed!(null, new Event('error'))
  await vi.advanceTimersByTimeAsync(5_000)
  const socket = mocks.sockets[1]!
  const signal = { onInsert: vi.fn(), onUpdate: vi.fn(), onDelete: vi.fn() }
  const subscription = {
    onApplied: (callback: () => void) => {
      socket.applied = callback
      return subscription
    },
    onError: () => subscription,
    subscribe: vi.fn(),
  }
  socket.connected!({
    db: { mySession: signal, myBattleSignals: signal, myProductSignals: signal, myAdminSignals: signal, publicProductSignals: signal },
    subscriptionBuilder: () => subscription,
    reducers: { watchBattle: vi.fn(async () => {}) },
  })
  socket.applied!()
  await vi.advanceTimersByTimeAsync(30_000)
  socket.failed!(null, new Event('error'))
  await vi.advanceTimersByTimeAsync(5_000)
  expect([mocks.sockets.length, mocks.captureException.mock.calls.length]).toEqual([3, 0])
})

it('captures a repeated unexpected HTTP rejection once while continuing retries', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response(null, { status: 404 })),
  )
  useSpacetimeLiveProduct({ mode: 'spacetime', database: 'test', uri: 'https://praetorium.gg/spacetime/' }, false)
  mount()
  await vi.advanceTimersByTimeAsync(15_000)
  expect(mocks.captureException.mock.calls).toEqual([[expect.objectContaining({ status: 404 }), { operation: 'spacetime_realtime' }]])
})

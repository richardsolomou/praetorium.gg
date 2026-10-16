import { afterEach, beforeEach, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  effects: [] as (() => void | (() => void))[],
  invalidateQueries: vi.fn(async () => {}),
  getQueryData: vi.fn(),
  captureException: vi.fn(),
  useQuery: vi.fn(),
  sockets: [] as {
    connected?: (current: unknown) => void
    failed?: (current: unknown, error: unknown, retrying?: number) => void
    dropped?: (current: unknown, error?: unknown, retrying?: number) => void
    renew?: () => Promise<string>
    applied?: () => void
  }[],
}))

vi.mock('react', () => ({
  useEffect: (effect: () => void | (() => void)) => mocks.effects.push(effect),
  useCallback: (callback: unknown) => callback,
  useMemo: (factory: () => unknown) => factory(),
  useState: () => [false, vi.fn()],
}))
vi.mock('@tanstack/react-query', () => ({
  useQuery: mocks.useQuery,
  useQueryClient: () => ({ invalidateQueries: mocks.invalidateQueries, getQueryData: mocks.getQueryData }),
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
        withAutomaticReconnect: () => builder,
        withTokenProvider: (provider: typeof socket.renew) => {
          socket.renew = provider
          return builder
        },
        onConnect: (callback: typeof socket.connected) => {
          socket.connected = callback
          return builder
        },
        onDisconnect: (callback: typeof socket.dropped) => {
          socket.dropped = callback
          return builder
        },
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

import { useRealtimeConfig, useSpacetimeLiveBattle, useSpacetimeLiveProduct } from './spacetimeLive'

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
  mocks.useQuery.mockReset()
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

it('does not capture or log a realtime configuration timeout', () => {
  mocks.useQuery.mockReturnValue({ error: new DOMException('signal timed out', 'TimeoutError') })
  useRealtimeConfig()
  mount()
  expect([mocks.captureException.mock.calls.length, vi.mocked(console.error).mock.calls.length]).toEqual([0, 0])
})

it('captures an unexpected realtime configuration error', () => {
  const error = new Error('Invalid realtime configuration')
  mocks.useQuery.mockReturnValue({ error })
  useRealtimeConfig()
  mount()
  expect(mocks.captureException.mock.calls).toEqual([[error, { operation: 'spacetime_realtime' }]])
})

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

it.each([new TypeError('Load failed'), new DOMException('signal timed out', 'TimeoutError')])(
  'retries recoverable ticket failures without authentication checks or error reports: %s',
  async (error) => {
    const fetch = vi.fn(async () => {
      throw error
    })
    vi.stubGlobal('fetch', fetch)
    useSpacetimeLiveProduct({ mode: 'spacetime', database: 'test', uri: 'https://praetorium.gg/spacetime/' }, true)
    mount()
    await vi.advanceTimersByTimeAsync(15_000)
    expect([
      fetch.mock.calls.length,
      mocks.invalidateQueries.mock.calls.length,
      mocks.captureException.mock.calls.length,
      vi.mocked(console.error).mock.calls.length,
    ]).toEqual([3, 0, 0, 0])
  },
)

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
  mocks.sockets[0]!.failed!(null, new Error('WebSocket error', { cause: new Event('error') }))
  await vi.advanceTimersByTimeAsync(5_000)
  const socket = mocks.sockets[1]!
  const signal = { onInsert: vi.fn(), onUpdate: vi.fn(), onDelete: vi.fn(), iter: () => [].values() }
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
  socket.failed!(null, new Error('WebSocket error', { cause: new Event('error') }))
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

it('captures a sustained guest token outage once', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response(null, { status: 502 })),
  )
  useSpacetimeLiveProduct({ mode: 'spacetime', database: 'test', uri: 'https://praetorium.gg/spacetime/' }, false)
  mount()
  await vi.advanceTimersByTimeAsync(10 * 60_000)
  expect(mocks.captureException.mock.calls).toEqual([
    [
      expect.objectContaining({ message: 'Spacetime guest token failed with HTTP 502 on 5 consecutive attempts' }),
      { operation: 'spacetime_realtime' },
    ],
  ])
})

const product = { mode: 'spacetime', database: 'test', uri: 'https://praetorium.gg/spacetime/' } as const
const issued = (battleId: string | null = null) =>
  vi.fn(async () => Response.json({ token: 'ticket', database: 'test', uri: 'https://praetorium.gg/spacetime/', battleId }))

/** Connects the latest socket with these signal rows and applies its subscription. */
function apply(rows: { product?: { scope: string; revision: bigint }[]; battle?: { battleId: string; seq: number }[] } = {}) {
  const socket = mocks.sockets.at(-1)!
  const table = (current: unknown[] = []) => ({ onInsert: vi.fn(), onUpdate: vi.fn(), onDelete: vi.fn(), iter: () => current.values() })
  const subscription = {
    onApplied: (callback: () => void) => {
      socket.applied = callback
      return subscription
    },
    onError: () => subscription,
    subscribe: vi.fn(),
  }
  const db = {
    mySession: table(),
    myBattleSignals: table(rows.battle),
    myProductSignals: table(rows.product),
    myAdminSignals: table(),
    publicProductSignals: table(),
  }
  socket.connected!({
    db,
    subscriptionBuilder: () => subscription,
    reducers: { watchBattle: vi.fn(async () => {}) },
  })
  socket.applied!()
  return db
}

it('refreshes only the scopes that changed while a product connection was renewed', async () => {
  vi.stubGlobal('fetch', issued())
  useSpacetimeLiveProduct(product, true)
  mount()
  await vi.advanceTimersByTimeAsync(0)
  apply({
    product: [
      { scope: 'rosters', revision: 1n },
      { scope: 'friends', revision: 4n },
    ],
  })
  await vi.advanceTimersByTimeAsync(4 * 60_000)
  mocks.invalidateQueries.mockClear()
  apply({
    product: [
      { scope: 'rosters', revision: 2n },
      { scope: 'friends', revision: 4n },
    ],
  })
  const filters = mocks.invalidateQueries.mock.calls as unknown as [{ predicate?: (query: unknown) => boolean }][]
  const refreshed = new Set(
    filters.flatMap(([filter]) => ['roster-bootstrap', 'friendships'].filter((key) => filter.predicate?.({ queryKey: [key] }))),
  )
  expect([...refreshed]).toEqual(['roster-bootstrap'])
})

const refreshesOf = (key: string) =>
  (mocks.invalidateQueries.mock.calls as unknown as [{ predicate?: (query: unknown) => boolean }][]).filter(([filter]) =>
    filter.predicate?.({ queryKey: [key] }),
  ).length

it('refreshes a query both signal lists follow once when a product connection first opens', async () => {
  vi.stubGlobal('fetch', issued())
  useSpacetimeLiveProduct(product, true)
  mount()
  await vi.advanceTimersByTimeAsync(0)
  apply()
  expect(refreshesOf('leagues')).toBe(1)
})

it('refreshes no account query when a signed-out connection first opens', async () => {
  vi.stubGlobal('fetch', issued())
  useSpacetimeLiveProduct(product, false)
  mount()
  await vi.advanceTimersByTimeAsync(0)
  apply()
  expect({ public: refreshesOf('public-battles'), account: refreshesOf('collection') }).toEqual({ public: 1, account: 0 })
})

it('ignores a signal row the first catch-up already read', async () => {
  vi.stubGlobal('fetch', issued())
  useSpacetimeLiveProduct(product, true)
  mount()
  await vi.advanceTimersByTimeAsync(0)
  const db = apply({ product: [{ scope: 'collection', revision: 3n }] })
  mocks.invalidateQueries.mockClear()
  const inserted = db.myProductSignals.onInsert.mock.calls[0]![0] as (context: unknown, row: unknown) => void
  inserted({}, { scope: 'collection', revision: 3n })
  expect(refreshesOf('collection')).toBe(0)
})

it('refreshes a scope whose signal moves after the catch-up', async () => {
  vi.stubGlobal('fetch', issued())
  useSpacetimeLiveProduct(product, true)
  mount()
  await vi.advanceTimersByTimeAsync(0)
  const db = apply({ product: [{ scope: 'collection', revision: 3n }] })
  mocks.invalidateQueries.mockClear()
  const updated = db.myProductSignals.onUpdate.mock.calls[0]![0] as (context: unknown, old: unknown, row: unknown) => void
  updated({}, {}, { scope: 'collection', revision: 4n })
  expect(refreshesOf('collection')).toBe(1)
})

it('does not refetch a battle screen that already holds the sequence a renewed connection reports', async () => {
  vi.stubGlobal('fetch', issued('battle-id'))
  mocks.getQueryData.mockReturnValue({ kind: 'battle', view: { seq: 7 } })
  useSpacetimeLiveBattle('battle-token', true)
  mount()
  await vi.advanceTimersByTimeAsync(0)
  apply({ battle: [{ battleId: 'battle-id', seq: 7 }] })
  expect(mocks.invalidateQueries.mock.calls).not.toContainEqual([{ queryKey: ['battle', 'battle-token'] }])
})

it('asks for an open battle again when its signal leaves, as it does when the battle is deleted', async () => {
  vi.stubGlobal('fetch', issued('battle-id'))
  mocks.getQueryData.mockReturnValue({ kind: 'battle', view: { seq: 7 } })
  useSpacetimeLiveBattle('battle-token', true)
  mount()
  await vi.advanceTimersByTimeAsync(0)
  const db = apply({ battle: [{ battleId: 'battle-id', seq: 7 }] })
  mocks.invalidateQueries.mockClear()
  const deleted = db.myBattleSignals.onDelete.mock.calls[0]![0] as (context: unknown, row: unknown) => void
  deleted({}, { battleId: 'battle-id', seq: 7 })
  expect(mocks.invalidateQueries.mock.calls).toContainEqual([{ queryKey: ['battle', 'battle-token'] }])
})

it.each([401, 403, 404])('stops asking for a battle ticket the viewer is refused (HTTP %s)', async (status) => {
  const fetch = vi.fn(async () => new Response(null, { status }))
  vi.stubGlobal('fetch', fetch)
  useSpacetimeLiveBattle('battle-token', true)
  mount()
  await vi.advanceTimersByTimeAsync(5 * 60_000)
  expect(fetch).toHaveBeenCalledOnce()
})

it.each(['product', 'battle'] as const)('keeps a %s connection while the SDK reconnects its socket', async (surface) => {
  vi.stubGlobal('fetch', issued('battle-id'))
  if (surface === 'product') useSpacetimeLiveProduct(product, true)
  else useSpacetimeLiveBattle('battle-token', true)
  mount()
  await vi.advanceTimersByTimeAsync(0)
  apply()
  mocks.sockets[0]!.dropped!(null, new Error('WebSocket closed (code 1006)'), 1)
  await vi.advanceTimersByTimeAsync(60_000)
  expect(mocks.sockets.length).toBe(1)
})

it.each(['product', 'battle'] as const)('replaces a %s connection the SDK has given up on', async (surface) => {
  vi.stubGlobal('fetch', issued('battle-id'))
  if (surface === 'product') useSpacetimeLiveProduct(product, true)
  else useSpacetimeLiveBattle('battle-token', true)
  mount()
  await vi.advanceTimersByTimeAsync(0)
  apply()
  mocks.sockets[0]!.dropped!(null, new Error('WebSocket closed (code 1002)'))
  await vi.advanceTimersByTimeAsync(5_000)
  expect(mocks.sockets.length).toBe(2)
})

it('reconnects with a freshly issued token', async () => {
  const fetch = vi.fn(async () =>
    Response.json({
      token: `ticket-${fetch.mock.calls.length}`,
      database: 'test',
      uri: 'https://praetorium.gg/spacetime/',
      battleId: null,
    }),
  )
  vi.stubGlobal('fetch', fetch)
  useSpacetimeLiveProduct(product, true)
  mount()
  await vi.advanceTimersByTimeAsync(0)
  expect(await mocks.sockets[0]!.renew!()).toBe('ticket-2')
})

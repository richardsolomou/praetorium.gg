import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { QueryClient } from '@tanstack/react-query'
import { emptyLocalState } from '../../contracts/localState'
import {
  setOwned,
  setFavouriteFaction,
  setFavouriteDetachment,
  setFavouriteDatasheet,
  setCollectionModels,
  setCollectionGroups,
  collection,
  collectionInventory,
} from './actionFunctions'
import { configureLocalRuntime, localEngine, stopLocalRuntime } from './localRuntime'
const mocks = vi.hoisted(() => ({ storage: vi.fn(), collection: vi.fn(), collectionCounts: vi.fn(), syncAction: vi.fn() }))
vi.mock('../../server/functions', () => ({
  collection: mocks.collection,
  availableCollection: mocks.collection,
  collectionCounts: mocks.collectionCounts,
  favouriteDatasheets: mocks.collection,
  favouriteFactions: mocks.collection,
  favouriteDetachments: mocks.collection,
}))
vi.mock('./localStorage', () => ({ localStateStorage: mocks.storage }))
vi.mock('../nativeBridge', () => ({ nativeBridgeVersion: () => undefined }))
vi.mock('../../server/functions/offline', () => ({ syncRoster: vi.fn(), syncAction: mocks.syncAction, syncBattleCommand: vi.fn() }))
const client = new QueryClient()
let state = emptyLocalState('alice')
beforeEach(() => {
  vi.resetAllMocks()
  vi.stubGlobal('window', {})
  vi.stubGlobal('navigator', { onLine: false })
  state = emptyLocalState('alice')
  mocks.storage.mockReturnValue({
    read: async () => state,
    change: async (update: (current: typeof state) => typeof state) => {
      state = { ...update(state), revision: state.revision + 1 }
      return state
    },
  })
  client.clear()
  client.setQueryData(['me'], { id: 'alice' })
  configureLocalRuntime(client, () => {})
})
afterEach(() => {
  stopLocalRuntime()
  vi.unstubAllGlobals()
})
it.each([
  ['collection', true],
  ['collection', false],
  ['favourite-factions', true],
  ['favourite-factions', false],
  ['favourite-detachments', true],
  ['favourite-detachments', false],
  ['favourite-datasheets', true],
  ['favourite-datasheets', false],
] as const)('preserves concurrent distinct-item updates to %s through reopening (add=%s)', async (key, addFirst) => {
  const resource = `query:${JSON.stringify([key])}`
  const entries = (ids: string[]) =>
    key === 'favourite-detachments' ? ids.map((detachmentId) => ({ catalogueId: 'cat', detachmentId })) : ids
  state.documents[resource] = { data: entries(addFirst ? [] : ['A']), serverVersion: null }
  const update = (id: string, selected: boolean) =>
    key === 'collection'
      ? setOwned({ data: { entryId: id, owned: selected } })
      : key === 'favourite-factions'
        ? setFavouriteFaction({ data: { catalogueId: id, favourite: selected } })
        : key === 'favourite-datasheets'
          ? setFavouriteDatasheet({ data: { entryId: id, favourite: selected } })
          : setFavouriteDetachment({ data: { catalogueId: 'cat', detachmentId: id, favourite: selected } })
  await Promise.all([update('A', addFirst), update('B', true)])
  stopLocalRuntime()
  const reopened = await localEngine()!.storage.read()
  expect({ saved: reopened.documents[resource]?.data, queued: reopened.operations.length }).toEqual({
    saved: entries(addFirst ? ['A', 'B'] : ['B']),
    queued: 2,
  })
})

it('keeps concurrent model counts for different datasheets through reopening', async () => {
  const resource = 'query:["collection-counts"]'
  state.documents[resource] = { data: { C: 4 }, serverVersion: null }
  await Promise.all([
    setCollectionModels({ data: { entryId: 'A', models: 1 } }),
    setCollectionModels({ data: { entryId: 'B', models: 12 } }),
  ])
  stopLocalRuntime()
  const reopened = await localEngine()!.storage.read()
  expect({ saved: reopened.documents[resource]?.data, queued: reopened.operations.length }).toEqual({
    saved: { A: 1, B: 12, C: 4 },
    queued: 2,
  })
})

it('keeps an acknowledged collection update when an older account download arrives', async () => {
  const resource = 'query:["collection"]'
  state.documents[resource] = { data: [], serverVersion: null }
  let finish!: (value: string[]) => void
  mocks.collection.mockReturnValue(
    new Promise((resolve) => {
      finish = resolve
    }),
  )
  vi.stubGlobal('navigator', { onLine: true })
  const loading = collection()
  await vi.waitFor(() => expect(mocks.collection).toHaveBeenCalledOnce())
  vi.stubGlobal('navigator', { onLine: false })
  await setOwned({ data: { entryId: 'A', owned: true } })
  vi.stubGlobal('navigator', { onLine: true })
  mocks.syncAction.mockResolvedValue({ outcome: 'applied' })
  await localEngine()!.sync()
  finish([])
  const downloaded = await loading
  expect({
    downloaded,
    saved: state.documents[resource]?.data,
    cached: client.getQueryData(['collection']),
    pending: state.operations,
  }).toEqual({ downloaded: ['A'], saved: ['A'], cached: ['A'], pending: [] })
})

it.each(['membership', 'counts', 'favourites'] as const)(
  'saves online collection %s locally without waiting for a download or acknowledgement',
  async (kind) => {
    const key = kind === 'membership' ? ['collection'] : kind === 'counts' ? ['collection-counts'] : ['favourite-datasheets']
    const resource = `query:${JSON.stringify(key)}`
    const initial = kind === 'counts' ? { A: 1 } : []
    const expected = kind === 'counts' ? { A: 3, B: 4 } : ['A', 'B']
    state.documents[resource] = { data: initial, serverVersion: null }
    client.setQueryData(key, initial)
    configureLocalRuntime(client, (saved) => client.setQueryData(key, saved.documents[resource]?.data))
    mocks.collection.mockResolvedValue([])
    mocks.collectionCounts.mockResolvedValue({ A: 1 })
    let acknowledge!: (value: { outcome: 'applied' }) => void
    mocks.syncAction.mockReturnValue(
      new Promise((resolve) => {
        acknowledge = resolve
      }),
    )
    vi.stubGlobal('navigator', { onLine: true })
    let finished = false
    const saving = (async () => {
      if (kind === 'membership') {
        await setOwned({ data: { entryId: 'A', owned: true } })
        await setOwned({ data: { entryId: 'B', owned: true } })
      } else if (kind === 'favourites') {
        await setFavouriteDatasheet({ data: { entryId: 'A', favourite: true } })
        await setFavouriteDatasheet({ data: { entryId: 'B', favourite: true } })
      } else {
        await setCollectionModels({ data: { entryId: 'A', models: 2 } })
        await setCollectionModels({ data: { entryId: 'A', models: 3 } })
        await setCollectionModels({ data: { entryId: 'B', models: 4 } })
      }
      finished = true
    })()
    try {
      await vi.waitFor(() => expect(finished).toBe(true))
      expect({
        saved: state.documents[resource]?.data,
        displayed: client.getQueryData(key),
        downloads: mocks.collection.mock.calls.length + mocks.collectionCounts.mock.calls.length,
      }).toEqual({ saved: expected, displayed: expected, downloads: 0 })
      acknowledge({ outcome: 'applied' })
      await localEngine()!.sync()
      expect(client.getQueryData(key)).toEqual(expected)
    } finally {
      stopLocalRuntime()
      acknowledge({ outcome: 'applied' })
      await saving
    }
  },
)

it('removes membership and its count together before an offline re-add', async () => {
  state.documents['query:["collection"]'] = { data: ['A', 'B'], serverVersion: null }
  state.documents['query:["collection-counts"]'] = { data: { A: 20, B: 4 }, serverVersion: null }
  await setOwned({ data: { entryId: 'A', owned: false } })
  await setOwned({ data: { entryId: 'A', owned: true } })
  expect({ owned: state.documents['query:["collection"]']?.data, counts: state.documents['query:["collection-counts"]']?.data }).toEqual({
    owned: ['B', 'A'],
    counts: { B: 4 },
  })
})

it('does not flash an older download into the cache before retaining a newer saved collection', async () => {
  const resource = 'query:["collection"]'
  state.documents[resource] = { data: [], serverVersion: null }
  let finish!: (value: string[]) => void
  mocks.collection.mockReturnValue(
    new Promise((resolve) => {
      finish = resolve
    }),
  )
  vi.stubGlobal('navigator', { onLine: true })
  const loading = collection()
  await vi.waitFor(() => expect(mocks.collection).toHaveBeenCalledOnce())
  vi.stubGlobal('navigator', { onLine: false })
  await setOwned({ data: { entryId: 'A', owned: true } })
  client.setQueryData(['collection'], ['A'])
  const displayed: unknown[] = []
  const unsubscribe = client.getQueryCache().subscribe((event) => {
    if (event.query.queryKey[0] === 'collection') displayed.push(event.query.state.data)
  })
  finish([])
  await loading
  unsubscribe()
  expect(displayed).toEqual([['A']])
})

it('saves shared stock and its derived ownership together before an offline reload', async () => {
  state.documents['query:["collection-inventory"]'] = { data: [{ entryId: 'ark', models: 1 }], serverVersion: null }
  state.documents['query:["collection"]'] = { data: ['ark'], serverVersion: null }
  state.documents['query:["collection-counts"]'] = { data: { ark: 1 }, serverVersion: null }
  const groups = [
    {
      models: 1,
      state: 'interchangeable' as const,
      builds: [
        { entryId: 'ark', equipment: '' },
        { entryId: 'ghost', equipment: '' },
      ],
    },
  ]
  await setCollectionGroups({ data: { entryId: 'ark', groups, expectedModels: 1, expectedGroups: null } })
  expect({
    inventory: state.documents['query:["collection-inventory"]']?.data,
    owned: state.documents['query:["collection"]']?.data,
    counts: state.documents['query:["collection-counts"]']?.data,
  }).toEqual({ inventory: [{ entryId: 'ark', models: 1, groups }], owned: ['ark', 'ghost'], counts: { ark: 1 } })
})

it('refuses a second window editing an older stock count before enqueueing', async () => {
  state.documents['query:["collection-inventory"]'] = { data: [{ entryId: 'ark', models: 2 }], serverVersion: null }
  await expect(setCollectionGroups({ data: { entryId: 'ark', groups: null, expectedModels: 1, expectedGroups: null } })).rejects.toThrow(
    'The collection changed',
  )
})

it('does not rewrite shared inventory through the legacy count path', async () => {
  const groups = [{ models: 1, state: 'fixed' as const, builds: [{ entryId: 'lord', equipment: 'Staff' }] }]
  state.documents['query:["collection-inventory"]'] = { data: [{ entryId: 'lord', models: 1, groups }], serverVersion: null }
  state.documents['query:["collection-counts"]'] = { data: { lord: 1 }, serverVersion: null }
  await expect(setCollectionModels({ data: { entryId: 'lord', models: 2 } })).rejects.toThrow('Edit model groups')
})

it('reads a pre-group offline collection without requiring a new download', async () => {
  state.documents['query:["collection"]'] = { data: ['lord'], serverVersion: null }
  state.documents['query:["collection-counts"]'] = { data: { lord: 2 }, serverVersion: null }
  expect(await collectionInventory()).toEqual([{ entryId: 'lord', models: 2 }])
})

it('edits counts offline using the inventory downloaded by the collection page', async () => {
  state.documents['query:["collection-inventory"]'] = { data: [{ entryId: 'lord', models: 2 }], serverVersion: null }
  await setCollectionModels({ data: { entryId: 'lord', models: 3 } })
  expect(state.documents['query:["collection-inventory"]']?.data).toEqual([{ entryId: 'lord', models: 3 }])
})

it('removes stock offline using the inventory without a separate membership download', async () => {
  state.documents['query:["collection-inventory"]'] = { data: [{ entryId: 'lord', models: 2 }], serverVersion: null }
  await setOwned({ data: { entryId: 'lord', owned: false } })
  expect(state.documents['query:["collection-inventory"]']?.data).toEqual([])
})

it('keeps a pre-group offline collection editable after restoring it', async () => {
  state.documents['query:["collection"]'] = { data: ['lord'], serverVersion: null }
  state.documents['query:["collection-counts"]'] = { data: { lord: 2 }, serverVersion: null }
  await collectionInventory()
  await setOwned({ data: { entryId: 'lord', owned: false } })
  expect(state.documents['query:["collection-inventory"]']?.data).toEqual([])
})

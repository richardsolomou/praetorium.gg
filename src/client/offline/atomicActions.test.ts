import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { QueryClient } from '@tanstack/react-query'
import { emptyLocalState } from '../../contracts/localState'
import { setOwned, setFavouriteFaction, setFavouriteDetachment, collection, collectionStock, updateCollectionLot } from './actionFunctions'
import { configureLocalRuntime, localEngine, stopLocalRuntime } from './localRuntime'
const mocks = vi.hoisted(() => ({ storage: vi.fn(), collection: vi.fn(), collectionStock: vi.fn(), syncAction: vi.fn() }))
vi.mock('../../server/functions', () => ({ collection: mocks.collection, collectionStock: mocks.collectionStock }))
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
        : setFavouriteDetachment({ data: { catalogueId: 'cat', detachmentId: id, favourite: selected } })
  await Promise.all([update('A', addFirst), update('B', true)])
  stopLocalRuntime()
  const reopened = await localEngine()!.storage.read()
  expect({ saved: reopened.documents[resource]?.data, queued: reopened.operations.length }).toEqual({
    saved: entries(addFirst ? ['A', 'B'] : ['B']),
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

const physicalLot = (models: number, id = 'd450802f-ae93-4b1c-af7f-a6ba202ab050') => ({
  id,
  name: 'Equipped bodies',
  models,
  builds: ['rifle'],
})
const stockResource = 'query:["collection-stock"]'

it.each([0, 1, 3])('retains %i physical models through saved offline actions and reopening', async (models) => {
  state.documents[stockResource] = { data: [], serverVersion: null }
  await updateCollectionLot({ data: { lot: physicalLot(models), expected: null } })
  stopLocalRuntime()
  expect((await localEngine()!.storage.read()).documents[stockResource]?.data).toEqual([physicalLot(models)])
})

it('retains concurrent edits to separate physical stocks', async () => {
  state.documents[stockResource] = { data: [], serverVersion: null }
  const other = physicalLot(2, 'd450802f-ae93-4b1c-af7f-a6ba202ab051')
  await Promise.all([
    updateCollectionLot({ data: { lot: physicalLot(1), expected: null } }),
    updateCollectionLot({ data: { lot: other, expected: null } }),
  ])
  expect(state.documents[stockResource]?.data).toEqual([physicalLot(1), other])
})

it('refuses a stale local stock edit before enqueueing it', async () => {
  state.documents[stockResource] = { data: [physicalLot(1)], serverVersion: null }
  await updateCollectionLot({ data: { lot: physicalLot(2), expected: physicalLot(1) } })
  await expect(updateCollectionLot({ data: { lot: physicalLot(3), expected: physicalLot(1) } })).rejects.toThrow('physical stock changed')
  expect(state.operations).toHaveLength(1)
})

it('retains conflicting physical stock on the device for review after reconnecting', async () => {
  state.documents[stockResource] = { data: [physicalLot(1)], serverVersion: null }
  await updateCollectionLot({ data: { lot: physicalLot(2), expected: physicalLot(1) } })
  mocks.syncAction.mockResolvedValue({ outcome: 'refused', message: 'This stock changed on another device.' })
  vi.stubGlobal('navigator', { onLine: true })
  await localEngine()!.sync()
  expect({ stock: state.documents[stockResource]?.data, status: state.operations[0]?.status }).toEqual({
    stock: [physicalLot(2)],
    status: 'refused',
  })
})

it('does not replace acknowledged stock with an older account download', async () => {
  state.documents[stockResource] = { data: [], serverVersion: null }
  let finish!: (value: ReturnType<typeof physicalLot>[]) => void
  mocks.collectionStock.mockReturnValue(
    new Promise((resolve) => {
      finish = resolve
    }),
  )
  vi.stubGlobal('navigator', { onLine: true })
  const loading = collectionStock()
  await vi.waitFor(() => expect(mocks.collectionStock).toHaveBeenCalledOnce())
  vi.stubGlobal('navigator', { onLine: false })
  await updateCollectionLot({ data: { lot: physicalLot(2), expected: null } })
  mocks.syncAction.mockResolvedValue({ outcome: 'applied' })
  vi.stubGlobal('navigator', { onLine: true })
  await localEngine()!.sync()
  finish([])
  expect(await loading).toEqual([physicalLot(2)])
})

import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { QueryClient } from '@tanstack/react-query'
import { emptyLocalState } from '../../contracts/localState'
import { setOwned, setFavouriteFaction, setFavouriteDetachment, collection } from './actionFunctions'
import { configureLocalRuntime, localEngine, stopLocalRuntime } from './localRuntime'
const mocks = vi.hoisted(() => ({ storage: vi.fn(), collection: vi.fn(), syncAction: vi.fn() }))
vi.mock('../../server/functions', () => ({ collection: mocks.collection }))
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

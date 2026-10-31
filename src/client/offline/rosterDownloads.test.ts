import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { QueryClient } from '@tanstack/react-query'
import { emptyLocalState } from '../../contracts/localState'
import { saveRosterSchema } from '../../contracts/schemas'
import { rosterAccess, rosterBootstrap, saveRoster, savedRosterSummaries, projectLocalState } from '../functions'
import { configureLocalRuntime, localEngine, rememberDocument, stopLocalRuntime } from './localRuntime'

const mocks = vi.hoisted(() => ({
  access: vi.fn(),
  bootstrap: vi.fn(),
  summaries: vi.fn(),
  syncRoster: vi.fn(),
  storage: vi.fn(),
  price: vi.fn(),
}))
vi.mock('../../server/functions', () => ({
  priceRoster: mocks.price,
  rosterAccess: mocks.access,
  rosterBootstrap: mocks.bootstrap,
  savedRosterSummaries: mocks.summaries,
}))
vi.mock('../../server/functions/offline', () => ({ syncRoster: mocks.syncRoster, syncAction: vi.fn(), syncBattleCommand: vi.fn() }))
vi.mock('./localStorage', () => ({ localStateStorage: mocks.storage }))
vi.mock('../nativeBridge', () => ({ nativeBridgeVersion: () => undefined }))
vi.mock('./construction', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./construction')>()),
  localConstruction: () => null,
}))
vi.mock('./runtime', async (actual) => ({ ...(await actual<typeof import('./runtime')>()), referenceData: () => undefined }))
// These read connected and offline construction; the construction worker answers neither.
vi.mock('./constructionWorker', () => ({ deviceConstructionRead: () => null, prepareDeviceConstruction: () => {} }))
const client = new QueryClient()
const original = {
  ...saveRosterSchema.parse({
    id: 'army',
    name: 'Old',
    catalogueId: 'cat',
    detachmentIds: [],
    disposition: null,
    limit: 1000,
    picks: [],
    prep: null,
  }),
  id: 'army',
  automaticName: false,
  baseRosterId: null,
  createdAt: 1,
  updatedAt: 1,
}
let state = emptyLocalState('alice')
beforeEach(() => {
  vi.resetAllMocks()
  vi.stubGlobal('window', {})
  vi.stubGlobal('navigator', { onLine: true })
  state = emptyLocalState('alice')
  state.documents['roster:army'] = { data: original, serverVersion: 1 }
  mocks.storage.mockReturnValue({
    read: async () => state,
    change: async (update: (current: typeof state) => typeof state) => {
      const next = update(state)
      if (next !== state) state = { ...next, revision: state.revision + 1 }
      return state
    },
  })
  mocks.price.mockResolvedValue(null)
  mocks.syncRoster.mockResolvedValue({ outcome: 'applied', version: 2 })
  client.clear()
  client.setQueryData(['me'], { id: 'alice' })
  configureLocalRuntime(client, projectLocalState)
})
afterEach(() => {
  stopLocalRuntime()
  vi.unstubAllGlobals()
})

it('keeps refreshed sealed event seals when unrelated saved work is projected online', () => {
  const fresh = { eventToken: 'event', entries: [{ userId: 'alice', submitted: true }] }
  client.setQueryData(['sealed-event', 'tournament', 'current'], fresh)
  state.documents['league:tournament'] = {
    data: { ...fresh, entries: [{ userId: 'alice', submitted: false }] },
    serverVersion: null,
  }
  projectLocalState(state)
  expect(client.getQueryData(['sealed-event', 'tournament', 'current'])).toEqual(fresh)
})

it.each([
  ['access', rosterAccess, mocks.access, 'roster-access'],
  ['bootstrap', rosterBootstrap, mocks.bootstrap, 'roster-bootstrap'],
] as const)('keeps an acknowledged edit when an older %s download arrives', async (_name, read, remote, key) => {
  let finish!: (value: unknown) => void
  remote.mockReturnValue(
    new Promise((resolve) => {
      finish = resolve
    }),
  )
  const loading = read({ data: { id: 'army' } })
  await vi.waitFor(() => expect(remote).toHaveBeenCalledOnce())
  await saveRoster({ data: { ...original, name: 'New' } })
  await localEngine()!.sync()
  expect(state.operations).toEqual([])
  finish({ roster: original, editable: true, faction: null, variants: [], differences: null, price: null, changes: [] })
  const result = await loading
  expect({
    saved: (state.documents['roster:army']?.data as typeof original)?.name,
    version: state.documents['roster:army']?.serverVersion,
    returned: result?.roster.name,
    cached: client.getQueryData<{ roster: typeof original }>([key, 'army', null])?.roster.name,
  }).toEqual({ saved: 'New', version: 2, returned: 'New', cached: 'New' })
})
it('keeps a newly acknowledged roster when an older summary list arrives', async () => {
  let finish!: (value: unknown[]) => void
  mocks.summaries.mockReturnValue(
    new Promise((resolve) => {
      finish = resolve
    }),
  )
  const loading = savedRosterSummaries()
  await vi.waitFor(() => expect(mocks.summaries).toHaveBeenCalledOnce())
  await saveRoster({ data: { ...original, id: 'new-army', name: 'New' } })
  await localEngine()!.sync()
  finish([])
  const summaries = await loading
  expect({ documents: Object.keys(state.documents), summaries: summaries.map((entry) => entry.id) }).toEqual({
    documents: ['roster:new-army'],
    summaries: ['new-army'],
  })
})
it('removes an unchanged roster when a fresh download confirms deletion', async () => {
  mocks.access.mockResolvedValue(null)
  const result = await rosterAccess({ data: { id: 'army' } })
  expect({ result, saved: state.documents['roster:army']?.data }).toEqual({ result: null, saved: null })
})

it.each([
  ['access', rosterAccess, mocks.access, 'roster-access'],
  ['bootstrap', rosterBootstrap, mocks.bootstrap, 'roster-bootstrap'],
] as const)('keeps a new acknowledged roster when an earlier missing %s response arrives', async (_name, read, remote, key) => {
  state.documents = {}
  let finish!: (value: null) => void
  remote.mockReturnValue(
    new Promise((resolve) => {
      finish = resolve
    }),
  )
  const loading = read({ data: { id: 'army' } })
  await vi.waitFor(() => expect(remote).toHaveBeenCalledOnce())
  await saveRoster({ data: { ...original, name: 'New' } })
  await localEngine()!.sync()
  finish(null)
  const result = await loading
  expect({
    returned: result?.roster.name,
    cached: client.getQueryData<{ roster: typeof original }>([key, 'army', null])?.roster.name,
  }).toEqual({ returned: 'New', cached: 'New' })
})

it('saves nothing for a roster download identical to the saved copy', async () => {
  const before = state
  await rememberDocument('roster:army', structuredClone(original), 1)
  expect(state.revision).toBe(before.revision)
})

it('saves nothing for a battle download that differs only in its server time', async () => {
  const workspace = { battle: { token: 'battle' }, log: [], serverSeq: 3, serverNow: 1 }
  state.documents['battle:battle'] = { data: workspace, serverVersion: 3 }
  const before = state.revision
  await rememberDocument('battle:battle', { ...workspace, serverNow: 2 }, 3)
  expect(state.revision).toBe(before)
})

it('saves a roster download that changed on the server', async () => {
  await rememberDocument('roster:army', { ...original, name: 'Renamed', updatedAt: 2 }, 2)
  expect((state.documents['roster:army']!.data as typeof original).name).toBe('Renamed')
})

it('opens a saved roster without waiting for its download to be saved', async () => {
  mocks.bootstrap.mockResolvedValue({ roster: { ...original, updatedAt: 2 }, editable: true, faction: null, price: null, changes: [] })
  mocks.storage.mockReturnValue({ read: async () => state, change: () => new Promise(() => {}) })
  stopLocalRuntime()
  configureLocalRuntime(client, projectLocalState)
  expect((await rosterBootstrap({ data: { id: 'army' } }))?.roster.updatedAt).toBe(2)
})

import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { QueryClient } from '@tanstack/react-query'
import { emptyLocalState } from '../../contracts/localState'
import { saveRosterSchema } from '../../contracts/schemas'
import { saveRoster } from '../functions'
import { configureLocalRuntime, stopLocalRuntime } from './localRuntime'

const mocks = vi.hoisted(() => ({
  storage: vi.fn(),
  directSave: vi.fn(),
  sync: vi.fn(),
  shared: vi.fn(),
  native: undefined as number | undefined,
}))
vi.mock('../../server/functions', () => ({ saveRoster: mocks.directSave, sharedRoster: mocks.shared }))
vi.mock('./localStorage', () => ({ localStateStorage: mocks.storage }))
vi.mock('./construction', () => ({ localConstruction: () => null }))
vi.mock('../nativeBridge', () => ({ nativeBridgeVersion: () => mocks.native, supportsNativeLocalState: () => false }))
vi.mock('../../server/functions/offline', () => ({ syncRoster: mocks.sync, syncAction: vi.fn(), syncBattleCommand: vi.fn() }))
const client = new QueryClient()
const original = saveRosterSchema.parse({
  id: 'army',
  name: 'Army',
  catalogueId: 'cat',
  detachmentIds: ['one'],
  disposition: null,
  limit: 2000,
  picks: [],
  prep: null,
})
let state = emptyLocalState('alice')
beforeEach(() => {
  vi.resetAllMocks()
  mocks.native = undefined
  vi.stubGlobal('window', {})
  vi.stubGlobal('navigator', { onLine: false })
  state = emptyLocalState('alice')
  state.documents['roster:army'] = { data: { ...original, createdAt: 1, updatedAt: 1 }, serverVersion: 1 }
  mocks.storage.mockReturnValue({
    read: async () => state,
    change: async (update: (current: typeof state) => typeof state) => (state = update(state)),
  })
  client.clear()
  client.setQueryData(['me'], { id: 'alice' })
  configureLocalRuntime(client, () => {})
})
afterEach(() => {
  stopLocalRuntime()
  vi.unstubAllGlobals()
})
const receipt = { expectedVersion: 1, operationId: '3127aef0-4077-4b5d-bc87-66666159621b' }
function nativeSave() {
  mocks.native = 3
  return saveRoster({ data: { ...original, limit: 1000 } }, original, 'alice', receipt)
}

it('saves only one candidate reviewed against the same baseline during concurrent facade calls', async () => {
  const result = await Promise.allSettled([
    saveRoster({ data: { ...original, limit: 1000 } }, original),
    saveRoster({ data: { ...original, limit: 3000 } }, original),
  ])
  expect({
    results: result.map((entry) => entry.status),
    saved: (state.documents['roster:army']!.data as typeof original).limit,
    pending: state.operations.length,
  }).toEqual({ results: ['fulfilled', 'rejected'], saved: 1000, pending: 1 })
})

it('refuses a reviewed save when durable account storage is unavailable before direct server writes', async () => {
  client.setQueryData(['me'], null)
  stopLocalRuntime()
  const result = await saveRoster({ data: { ...original, limit: 1000 } }, original).catch((error: Error) => error.message)
  expect({ result, writes: mocks.directSave.mock.calls.length }).toEqual({
    result: 'Saved changes are not ready on this device. Reload the roster before reviewing it again.',
    writes: 0,
  })
})

it('accepts the existing builder empty-preparation default for an unchanged null-preparation roster', async () => {
  const reviewed = { ...original, prep: { stratagems: [], secondaries: [], reminders: [], remindersEnabled: true } }
  await saveRoster({ data: { ...reviewed, limit: 1000 } }, reviewed)
  expect((state.documents['roster:army']!.data as typeof original).limit).toBe(1000)
})

it('uses the captured server version and receipt for a native-v3 account save', async () => {
  mocks.sync.mockResolvedValue({ outcome: 'applied', version: 9 })
  mocks.shared.mockResolvedValue({ ...original, limit: 1000, updatedAt: 9 })
  const saved = await nativeSave()
  expect({ saved, request: mocks.sync.mock.calls[0]?.[0].data, directWrites: mocks.directSave.mock.calls.length }).toEqual({
    saved: { id: 'army', updatedAt: 9 },
    request: { ...receipt, owner: 'alice', roster: { ...original, limit: 1000 } },
    directWrites: 0,
  })
})

it('preserves the same server receipt and candidate after an uncertain native save', async () => {
  mocks.sync.mockRejectedValueOnce(new Error('Connection lost')).mockResolvedValue({ outcome: 'applied', version: 9 })
  mocks.shared.mockResolvedValue({ ...original, limit: 1000, updatedAt: 9 })
  await expect(nativeSave()).rejects.toThrow('Connection lost')
  await nativeSave()
  expect(mocks.sync.mock.calls.map(([request]) => request.data)).toEqual([
    { ...receipt, owner: 'alice', roster: { ...original, limit: 1000 } },
    { ...receipt, owner: 'alice', roster: { ...original, limit: 1000 } },
  ])
})

it('refuses an older native acknowledgement even when the later row has the same candidate content', async () => {
  mocks.sync.mockResolvedValue({ outcome: 'applied', version: 9 })
  mocks.shared.mockResolvedValue({ ...original, limit: 1000, updatedAt: 10 })
  await expect(nativeSave()).rejects.toThrow('changed after your review')
})

it('refuses native result projection when the account changes during the server save', async () => {
  mocks.sync.mockImplementation(async () => {
    client.setQueryData(['me'], { id: 'bob' })
    return { outcome: 'applied', version: 9 }
  })
  await expect(nativeSave()).rejects.toThrow('account changed')
})

it('refuses a native acknowledgement whose saved candidate differs at the same version', async () => {
  mocks.sync.mockResolvedValue({ outcome: 'applied', version: 9 })
  mocks.shared.mockResolvedValue({ ...original, limit: 2000, updatedAt: 9 })
  await expect(nativeSave()).rejects.toThrow('changed after your review')
})

it('refuses native result projection when the account changes during acknowledgement verification', async () => {
  mocks.sync.mockResolvedValue({ outcome: 'applied', version: 9 })
  mocks.shared.mockImplementation(async () => {
    client.setQueryData(['me'], { id: 'bob' })
    return { ...original, limit: 1000, updatedAt: 9 }
  })
  await expect(nativeSave()).rejects.toThrow('account changed')
})

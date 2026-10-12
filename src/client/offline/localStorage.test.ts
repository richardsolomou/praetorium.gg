import { beforeEach, afterEach, expect, it, vi } from 'vitest'
import { MAX_LOCAL_STATE_BYTES, type LocalState } from '../../contracts/localState'
const disk = vi.hoisted(() => new Map<string, unknown>())
vi.mock('idb-keyval', () => ({
  createStore: () => ({}),
  get: async (key: string) => structuredClone(disk.get(key)),
  update: async (key: string, change: (current: unknown) => unknown) =>
    disk.set(key, structuredClone(change(structuredClone(disk.get(key))))),
}))
const native = vi.hoisted(() => ({ enabled: false, writes: 0, disk: new Map<string, { epoch: string; state: LocalState | null }>() }))
vi.mock('../nativeBridge', () => ({
  supportsNativeLocalState: () => native.enabled,
  // The shell answers each message after a round trip, accepting a write only at the revision it was read at.
  requestNativeLocalState: async (owner: string, write?: { state: LocalState | null; epoch: string; expectedRevision: number }) => {
    await new Promise((resolve) => setTimeout(resolve, 1))
    const previous = native.disk.get(owner) ?? { epoch: 'native-epoch', state: null }
    if (!write) return structuredClone({ ...previous, saved: true })
    native.writes++
    if (previous.epoch !== write.epoch || (previous.state?.revision ?? 0) !== write.expectedRevision)
      return structuredClone({ ...previous, saved: false })
    const next = { epoch: write.epoch, state: write.state }
    native.disk.set(owner, structuredClone(next))
    return structuredClone({ ...next, saved: true })
  },
}))
import { clearLocalState, localStateStorage, LOCAL_STATE_EVENT } from './localStorage'
let owner: string
beforeEach(() => {
  owner = crypto.randomUUID()
  vi.stubGlobal('window', new EventTarget())
  vi.stubGlobal('document', Object.assign(new EventTarget(), { visibilityState: 'visible' }))
  vi.stubGlobal('localStorage', { setItem: vi.fn() })
})
afterEach(() => {
  native.enabled = false
  native.writes = 0
  vi.unstubAllGlobals()
})
it('returns the same empty account generation until its first write', async () => {
  const storage = localStateStorage(owner)
  expect((await storage.read()).epoch).toBe((await storage.read()).epoch)
})
it('keeps a previously saved document when a replacement exceeds the byte limit', async () => {
  const storage = localStateStorage(owner)
  await storage.change((state) => ({ ...state, documents: { roster: { data: 'Saved army', serverVersion: 1 } } }))
  await expect(
    storage.change((state) => ({ ...state, documents: { roster: { data: 'x'.repeat(MAX_LOCAL_STATE_BYTES), serverVersion: 1 } } })),
  ).rejects.toThrow('storage limit')
  expect((await localStateStorage(owner).read()).documents.roster?.data).toBe('Saved army')
})
it('refuses an old writer after account data is cleared', async () => {
  const storage = localStateStorage(owner)
  await storage.read()
  await clearLocalState(owner)
  await expect(storage.change((state) => ({ ...state, documents: { private: { data: 'Old army', serverVersion: 1 } } }))).rejects.toThrow(
    'account on this device changed',
  )
})
it('does not read another account’s documents', async () => {
  await localStateStorage(owner).change((state) => ({ ...state, documents: { private: { data: 'Private army', serverVersion: 1 } } }))
  expect((await localStateStorage(crypto.randomUUID()).read()).documents).toEqual({})
})
it('announces a durable save so another open screen can restore it', async () => {
  const notified = vi.fn()
  window.addEventListener(LOCAL_STATE_EVENT, notified)
  await localStateStorage(owner).change((state) => ({ ...state, documents: { roster: { data: 'Saved army', serverVersion: 1 } } }))
  expect(notified).toHaveBeenCalledOnce()
})
it('retains work queued during sign-out’s network requests', async () => {
  const storage = localStateStorage(owner)
  const operation = {
    id: crypto.randomUUID(),
    resource: 'roster:one',
    kind: 'saveRoster',
    input: {},
    createdAt: 1,
    status: 'pending' as const,
  }
  await storage.change((state) => ({ ...state, operations: [operation] }))
  await clearLocalState(owner, true)
  expect((await storage.read()).operations).toEqual([operation])
})
it('keeps every change one native app screen saves at once', async () => {
  native.enabled = true
  const storage = localStateStorage(owner)
  await Promise.all(
    Array.from({ length: 12 }, (_, index) =>
      storage.change((state) => ({ ...state, documents: { ...state.documents, [`roster:${index}`]: { data: index, serverVersion: 1 } } })),
    ),
  )
  expect(Object.keys((await storage.read()).documents)).toHaveLength(12)
})
it('sends the native app nothing for a change that keeps the saved state', async () => {
  native.enabled = true
  const storage = localStateStorage(owner)
  await storage.change((state) => ({ ...state, documents: { roster: { data: 'Saved army', serverVersion: 1 } } }))
  await storage.change((state) => state)
  expect(native.writes).toBe(1)
})

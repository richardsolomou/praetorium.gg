import { beforeEach, afterEach, expect, it, vi } from 'vitest'
import { MAX_LOCAL_STATE_BYTES } from '../../contracts/localState'
const disk = vi.hoisted(() => new Map<string, unknown>())
vi.mock('idb-keyval', () => ({
  createStore: () => ({}),
  get: async (key: string) => structuredClone(disk.get(key)),
  update: async (key: string, change: (current: unknown) => unknown) =>
    disk.set(key, structuredClone(change(structuredClone(disk.get(key))))),
}))
vi.mock('../nativeBridge', () => ({ supportsNativeLocalState: () => false }))
import { clearLocalState, localStateStorage, LOCAL_STATE_EVENT } from './localStorage'
let owner: string
beforeEach(() => {
  owner = crypto.randomUUID()
  vi.stubGlobal('window', new EventTarget())
  vi.stubGlobal('document', Object.assign(new EventTarget(), { visibilityState: 'visible' }))
  vi.stubGlobal('localStorage', { setItem: vi.fn() })
})
afterEach(() => vi.unstubAllGlobals())
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

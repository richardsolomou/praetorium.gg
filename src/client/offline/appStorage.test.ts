import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import type { AppSnapshot } from '../../contracts/appSnapshot'

const disk = vi.hoisted(() => new Map<string, unknown>())
const native = vi.hoisted(() => ({ enabled: false }))
vi.mock('../nativeBridge', () => ({
  supportsNativeAppSnapshot: () => native.enabled,
  requestNativeAppSnapshot: async () => true,
}))
vi.mock('idb-keyval', () => ({
  createStore: vi.fn(),
  get: async (key: string) => disk.get(key),
  update: async (key: string, updater: (saved: unknown) => unknown) => disk.set(key, updater(disk.get(key))),
}))

const snapshot: AppSnapshot = {
  version: 1,
  owner: 'alice',
  queries: [{ key: ['me'], data: { id: 'alice' }, updatedAt: 1 }],
}

async function tab() {
  vi.resetModules()
  return import('./appStorage')
}

beforeEach(() => {
  disk.clear()
  native.enabled = false
  vi.stubGlobal('window', {})
  vi.stubGlobal('localStorage', { setItem: vi.fn() })
})

it.each(['browser', 'native'])('migrates older league queries read from %s storage without changing their timestamps', async (surface) => {
  const legacy: AppSnapshot = {
    ...snapshot,
    queries: [
      ...snapshot.queries,
      { key: ['league', 'league', 'current'], data: { token: 'league', entries: [] }, updatedAt: 2 },
      { key: ['leagues'], data: [{ token: 'league', personal: true }], updatedAt: 3 },
      { key: ['league', 'league', 'results', 'event'], data: { rows: [] }, updatedAt: 4 },
      { key: ['league', 'deleted', 'current'], data: null, updatedAt: 5 },
    ],
  }
  disk.set('snapshot', { epoch: 'saved', snapshot: legacy })
  native.enabled = surface === 'native'
  window.PraetoriumAppSnapshot = legacy
  const storage = await tab()
  const migrated = await storage.readAppSnapshot()
  await storage.writeAppSnapshot(migrated)
  expect(await storage.readAppSnapshot()).toEqual({
    ...snapshot,
    queries: [
      ...snapshot.queries,
      { key: ['league', 'league', 'current'], data: { token: 'league', entries: [], admins: [] }, updatedAt: 2 },
      { key: ['leagues'], data: [{ token: 'league', personal: true, adminIds: [] }], updatedAt: 3 },
      { key: ['league', 'league', 'results', 'event'], data: { rows: [] }, updatedAt: 4 },
      { key: ['league', 'deleted', 'current'], data: null, updatedAt: 5 },
    ],
  })
})
afterEach(() => vi.unstubAllGlobals())

it('restores a saved account after reopening the application', async () => {
  const first = await tab()
  await first.readAppSnapshot()
  await first.writeAppSnapshot(snapshot)
  const reopened = await tab()
  expect(await reopened.readAppSnapshot()).toEqual(snapshot)
})

it('prevents a stale tab from writing private data after another tab signs out', async () => {
  const first = await tab()
  await first.readAppSnapshot()
  await first.writeAppSnapshot(snapshot)
  const stale = await tab()
  await stale.readAppSnapshot()
  await first.clearSavedApp()
  await stale.writeAppSnapshot(snapshot)
  expect(await first.readAppSnapshot()).toBeNull()
})

it('lets a tab save the new account after reading the changed generation', async () => {
  const first = await tab()
  await first.readAppSnapshot()
  const other = await tab()
  await other.readAppSnapshot()
  await first.clearSavedApp()
  await other.readAppSnapshot()
  await other.writeAppSnapshot(snapshot)
  expect(await first.readAppSnapshot()).toEqual(snapshot)
})

it('keeps the previous snapshot when a replacement exceeds the disk limit', async () => {
  const storage = await tab()
  await storage.readAppSnapshot()
  await storage.writeAppSnapshot(snapshot)
  await storage.writeAppSnapshot({
    ...snapshot,
    queries: [...snapshot.queries, { key: ['home-rosters'], data: 'x'.repeat(10_000_000), updatedAt: 2 }],
  })
  expect(await storage.readAppSnapshot()).toEqual(snapshot)
})

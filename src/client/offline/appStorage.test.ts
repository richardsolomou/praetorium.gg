import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import type { AppSnapshot } from '../../contracts/appSnapshot'

const disk = vi.hoisted(() => new Map<string, unknown>())
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
  vi.stubGlobal('window', {})
  vi.stubGlobal('localStorage', { setItem: vi.fn() })
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

import { beforeEach, afterEach, expect, it, vi } from 'vitest'
import { emptyLocalState, MAX_LOCAL_STATE_BYTES, type LocalState } from '../../contracts/localState'
const disk = vi.hoisted(() => new Map<string, unknown>())
vi.mock('idb-keyval', () => ({
  createStore: () => ({}),
  get: async (key: string) => structuredClone(disk.get(key)),
  update: async (key: string, change: (current: unknown) => unknown) =>
    disk.set(key, structuredClone(change(structuredClone(disk.get(key))))),
}))
const native = vi.hoisted(() => ({
  enabled: false,
  writes: 0,
  reads: 0,
  disk: new Map<string, { epoch: string; state: LocalState | null }>(),
}))
vi.mock('../nativeBridge', () => ({
  supportsNativeLocalState: () => native.enabled,
  // The shell answers each message after a round trip, accepting a write only at the revision it was read at.
  requestNativeLocalState: async (owner: string, write?: { state: LocalState | null; epoch: string; expectedRevision: number }) => {
    await new Promise((resolve) => setTimeout(resolve, 1))
    const previous = native.disk.get(owner) ?? { epoch: 'native-epoch', state: null }
    if (!write) {
      native.reads++
      return structuredClone({ ...previous, saved: true })
    }
    native.writes++
    if (previous.epoch !== write.epoch || (previous.state?.revision ?? 0) !== write.expectedRevision)
      return structuredClone({ ...previous, saved: false })
    const next = { epoch: write.epoch, state: write.state }
    native.disk.set(owner, structuredClone(next))
    return structuredClone({ ...next, saved: true })
  },
}))
import { QueryClient } from '@tanstack/react-query'
import { writesPending } from '../pendingWrites'
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
  native.reads = 0
  vi.unstubAllGlobals()
})
it('renames work saved under the previous release’s names', async () => {
  const id = crypto.randomUUID()
  disk.set(`work:${owner}`, {
    epoch: 'generation',
    state: {
      ...emptyLocalState(owner),
      epoch: 'generation',
      operations: [
        {
          id,
          resource: 'league:tournament',
          kind: 'createLeague',
          input: { input: {}, identifiers: { leagueToken: 'token' } },
          createdAt: 1,
          status: 'pending',
        },
      ],
      documents: { 'battle:battle': { data: { log: [{ command: { kind: 'set-battle-club', clubId: 'group' } }] }, serverVersion: 1 } },
    },
  })
  expect(await localStateStorage(owner).read()).toMatchObject({
    operations: [
      { id, resource: 'sealed-event:tournament', kind: 'createSealedEvent', input: { identifiers: { tournamentToken: 'token' } } },
    ],
    documents: { 'battle:battle': { data: { log: [{ command: { kind: 'set-battle-group', groupId: 'group' } }] } } },
  })
})
it.each(['browser', 'native'])('drops a queued event saved before hosts from %s storage, keeping its action', async (surface) => {
  const legacy: LocalState = {
    ...emptyLocalState(owner),
    epoch: 'saved',
    revision: 7,
    operations: [
      {
        id: crypto.randomUUID(),
        resource: 'sealed-event:tournament',
        kind: 'createSealedEvent',
        input: {},
        createdAt: 1,
        status: 'pending',
      },
    ],
    documents: {
      'sealed-event:tournament': { data: { token: 'tournament', entries: [] }, serverVersion: null },
      'sealed-event:deleted': { data: null, serverVersion: null },
      'roster:roster': { data: 'Saved army', serverVersion: 1 },
    },
  }
  const saved = { epoch: 'generation', state: legacy }
  disk.set(`work:${owner}`, saved)
  native.disk.set(owner, saved)
  native.enabled = surface === 'native'
  const storage = localStateStorage(owner)
  await storage.read()
  await storage.change((state) => ({ ...state }))
  const { 'sealed-event:tournament': _dropped, ...documents } = legacy.documents
  expect(await localStateStorage(owner).read()).toEqual({ ...legacy, revision: 8, documents })
})
it('returns the same empty account generation until its first write', async () => {
  const storage = localStateStorage(owner)
  expect((await storage.read()).epoch).toBe((await storage.read()).epoch)
})
it.each(['browser', 'native'])('upgrades retired roster fields in %s storage while preserving pending receipt inputs', async (surface) => {
  const roster = {
    name: 'List',
    locked: true,
    picks: [{ entryId: 'unit', nickname: 'Leader', note: 'Hold home' }],
    prep: { shareNotes: true, remindersEnabled: false },
  }
  const operation = {
    id: crypto.randomUUID(),
    resource: 'roster:list',
    kind: 'saveRoster',
    input: roster,
    attempted: true,
    createdAt: 1,
    status: 'pending' as const,
  }
  const legacy: LocalState = {
    ...emptyLocalState(owner),
    epoch: 'saved',
    operations: [operation],
    documents: { 'roster:list': { data: roster, serverVersion: 7 } },
  }
  const saved = { epoch: 'generation', state: legacy }
  disk.set(`work:${owner}`, saved)
  native.disk.set(owner, saved)
  native.enabled = surface === 'native'
  await localStateStorage(owner).change((state) => ({ ...state }))
  expect(await localStateStorage(owner).read()).toEqual({
    ...legacy,
    revision: 1,
    documents: {
      'roster:list': {
        data: { ...roster, prep: { remindersEnabled: false } },
        serverVersion: 7,
      },
    },
  })
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
it('saves a native change without first reading back the state this screen holds', async () => {
  native.enabled = true
  const storage = localStateStorage(owner)
  await storage.change((state) => ({ ...state, documents: { first: { data: 1, serverVersion: 1 } } }))
  const reads = native.reads
  await storage.change((state) => ({ ...state, documents: { ...state.documents, second: { data: 2, serverVersion: 1 } } }))
  expect(native.reads).toBe(reads)
})
it("keeps another window's native save when this screen's copy is out of date", async () => {
  native.enabled = true
  const storage = localStateStorage(owner)
  await storage.change((state) => ({ ...state, documents: { first: { data: 1, serverVersion: 1 } } }))
  const saved = native.disk.get(owner)!
  native.disk.set(owner, {
    ...saved,
    state: {
      ...saved.state!,
      revision: saved.state!.revision + 1,
      documents: { ...saved.state!.documents, other: { data: 3, serverVersion: 1 } },
    },
  })
  const next = await storage.change((state) => ({ ...state, documents: { ...state.documents, second: { data: 2, serverVersion: 1 } } }))
  expect(Object.keys(next.documents).toSorted()).toEqual(['first', 'other', 'second'])
})
it("keeps the browser's saved state unchanged for a change that keeps it", async () => {
  const storage = localStateStorage(owner)
  const saved = await storage.change((state) => ({ ...state, documents: { roster: { data: 'Saved army', serverVersion: 1 } } }))
  expect((await storage.change((state) => state)).revision).toBe(saved.revision)
})

it('holds automatic reloads while a change is being saved', async () => {
  const saving = localStateStorage(owner).change((state) => ({ ...state }))
  expect(writesPending(new QueryClient())).toBe(true)
  await saving
})

import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { QueryClient } from '@tanstack/react-query'
import { emptyLocalState } from '../../contracts/localState'
import { saveRosterSchema } from '../../contracts/schemas'
import {
  copyRoster,
  rosterAccess,
  saveRoster,
  savedRosterSummaries,
  setRosterArchived,
  setRosterLocked,
  setRosterVisibility,
} from '../functions'
import { LOCKED_ROSTER_MESSAGE } from '../../core/rosterLock'

const mocks = vi.hoisted(() => ({
  owner: 'alice',
  summaries: vi.fn(),
  defaults: vi.fn(),
  queue: vi.fn(),
  setLocked: vi.fn(),
  setArchived: vi.fn(),
  access: vi.fn(),
  engines: new Map<string, ReturnType<typeof engine>>(),
}))
const client = new QueryClient()
vi.mock('../../server/functions', () => ({
  savedRosterSummaries: mocks.summaries,
  setRosterLocked: mocks.setLocked,
  setRosterArchived: mocks.setArchived,
  rosterAccess: mocks.access,
}))
vi.mock('./actionFunctions', () => ({ playerDefaults: mocks.defaults }))
vi.mock('./construction', () => ({ localConstruction: () => null }))
vi.mock('./localRuntime', () => ({
  localOwner: () => ({ id: mocks.owner }),
  localEngine: () => mocks.engines.get(mocks.owner),
  localClient: () => client,
  localDocument: async (resource: string) => (await mocks.engines.get(mocks.owner)!.storage.read()).documents[resource]?.data,
  hasLocalChanges: async () => false,
  queueLocal: mocks.queue,
  rememberDocument: vi.fn(),
  attemptLocalSync: vi.fn(),
}))
const roster = {
  ...saveRosterSchema.parse({ name: 'Army', catalogueId: 'cat', detachmentIds: [], disposition: null, limit: 1000, picks: [], prep: null }),
  id: 'original',
  automaticName: false,
  visibility: 'public' as const,
  baseRosterId: null,
  createdAt: 1,
  updatedAt: 1,
}
function engine(owner: string) {
  let state = emptyLocalState(owner)
  state.documents[`roster:${owner}`] = { data: { ...roster, id: owner }, serverVersion: 1 }
  return {
    storage: { read: async () => state, change: async (update: (current: typeof state) => typeof state) => (state = update(state)) },
  }
}
beforeEach(() => {
  vi.clearAllMocks()
  vi.stubGlobal('window', {})
  vi.stubGlobal('navigator', { onLine: false })
  mocks.owner = 'alice'
  mocks.engines.set('alice', engine('alice'))
  mocks.engines.set('bob', engine('bob'))
  client.clear()
  client.setQueryData(['saved-roster-summaries'], [roster])
  mocks.defaults.mockResolvedValue({ rosterVisibility: 'private', battleSize: 1000 })
})
afterEach(() => vi.unstubAllGlobals())

it.each([false, true])('uses the account privacy default for an offline copy (variant=%s)', async (variant) => {
  const alice = mocks.engines.get('alice')!
  await alice.storage.change((state: ReturnType<typeof emptyLocalState>) => ({
    ...state,
    documents: { 'roster:original': { data: roster, serverVersion: 1 } },
  }))
  await copyRoster({ data: { id: 'original', variant } })
  expect(mocks.queue.mock.calls[0]?.[1].visibility).toBe('private')
})

it('offers an offline variant group oldest first when its base was deleted', async () => {
  const variant = (id: string, createdAt: number) => ({ data: { ...roster, id, baseRosterId: 'deleted', createdAt }, serverVersion: 1 })
  await mocks.engines.get('alice')!.storage.change((state: ReturnType<typeof emptyLocalState>) => ({
    ...state,
    documents: { 'roster:newer': variant('newer', 3), 'roster:older': variant('older', 2) },
  }))
  const access = await rosterAccess({ data: { id: 'newer' } })
  expect(access?.variants.map(({ id }) => id)).toEqual(['older', 'newer'])
})

it('leaves the new account roster download intact when an old account response arrives', async () => {
  vi.stubGlobal('navigator', { onLine: true })
  let finish!: (value: unknown[]) => void
  mocks.summaries.mockReturnValue(
    new Promise((resolve) => {
      finish = resolve
    }),
  )
  const loading = savedRosterSummaries()
  await vi.waitFor(() => expect(mocks.summaries).toHaveBeenCalledOnce())
  mocks.owner = 'bob'
  finish([])
  await loading.catch(() => {})
  expect(Object.keys((await mocks.engines.get('bob')!.storage.read()).documents)).toEqual(['roster:bob'])
})

async function holdLocked() {
  await mocks.engines.get('alice')!.storage.change((state: ReturnType<typeof emptyLocalState>) => ({
    ...state,
    documents: { 'roster:original': { data: { ...roster, locked: true }, serverVersion: 1 } },
  }))
}

it('refuses an edit to a locked roster before saving it on the device', async () => {
  await holdLocked()
  await expect(saveRoster({ data: { ...roster, picks: [{ entryId: 'warriors' }] } })).rejects.toThrow(LOCKED_ROSTER_MESSAGE)
  expect(mocks.queue).not.toHaveBeenCalled()
})

it('saves a visibility change to a locked roster on the device', async () => {
  await holdLocked()
  await setRosterVisibility({ data: { id: 'original', visibility: 'private' } })
  expect(mocks.queue.mock.calls[0]?.[3].data).toMatchObject({ visibility: 'private', locked: true })
})

it('starts a copy of a locked roster unlocked', async () => {
  await holdLocked()
  await copyRoster({ data: { id: 'original', variant: true } })
  expect(mocks.queue.mock.calls[0]?.[3].data).toMatchObject({ baseRosterId: 'original', locked: false })
})

async function readOthersRoster() {
  vi.stubGlobal('navigator', { onLine: true })
  mocks.summaries.mockResolvedValue([])
  mocks.access.mockResolvedValue({ roster: { ...roster, id: 'published', name: 'Their army' }, editable: false })
}

it("copies another player's readable roster into the reader's own list", async () => {
  await readOthersRoster()
  await copyRoster({ data: { id: 'published', variant: false } })
  expect(mocks.queue.mock.calls[0]?.[3].data).toMatchObject({ name: 'Copy of Their army', baseRosterId: null, visibility: 'private' })
})

it("refuses a variant of another player's roster", async () => {
  await readOthersRoster()
  await expect(copyRoster({ data: { id: 'published', variant: true } })).rejects.toThrow('You do not own this roster.')
})

it('asks for a connection before locking a roster saved on the device', async () => {
  await expect(setRosterLocked({ data: { id: 'original', locked: true } })).rejects.toThrow(/Connect/)
  expect(mocks.setLocked).not.toHaveBeenCalled()
})

it('asks for a connection before archiving a roster saved on the device', async () => {
  await expect(setRosterArchived({ data: { id: 'original', archived: true } })).rejects.toThrow(/Connect/)
  expect(mocks.setArchived).not.toHaveBeenCalled()
})

async function holdBudget() {
  await mocks.engines.get('alice')!.storage.change((state: ReturnType<typeof emptyLocalState>) => ({
    ...state,
    documents: { 'roster:original': { data: { ...roster, limit: 2000, pointsBudget: 1500 }, serverVersion: 1 } },
  }))
}

it('keeps a custom points budget when a save from an older screen does not state one', async () => {
  await holdBudget()
  const { pointsBudget: _unstated, ...older } = { ...roster, limit: 2000 }
  await saveRoster({ data: { ...older, name: 'Renamed' } })
  expect(mocks.queue.mock.calls[0]?.[3].data).toMatchObject({ name: 'Renamed', pointsBudget: 1500 })
})

it('clears a custom points budget when a save asks for the standard total', async () => {
  await holdBudget()
  await saveRoster({ data: { ...roster, limit: 2000, pointsBudget: null } })
  expect(mocks.queue.mock.calls[0]?.[3].data).toMatchObject({ pointsBudget: null })
})

it('copies a custom points budget into a variant saved on the device', async () => {
  await holdBudget()
  await copyRoster({ data: { id: 'original', variant: true } })
  expect(mocks.queue.mock.calls[0]?.[3].data).toMatchObject({ limit: 2000, pointsBudget: 1500 })
})

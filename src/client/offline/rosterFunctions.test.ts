import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { QueryClient } from '@tanstack/react-query'
import { emptyLocalState } from '../../contracts/localState'
import { saveRosterSchema } from '../../contracts/schemas'
import { copyRoster, savedRosterSummaries } from '../functions'

const mocks = vi.hoisted(() => ({
  owner: 'alice',
  summaries: vi.fn(),
  defaults: vi.fn(),
  queue: vi.fn(),
  engines: new Map<string, ReturnType<typeof engine>>(),
}))
const client = new QueryClient()
vi.mock('../../server/functions', () => ({ savedRosterSummaries: mocks.summaries }))
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

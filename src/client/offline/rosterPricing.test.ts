import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { QueryClient } from '@tanstack/react-query'
import { emptyLocalState } from '../../contracts/localState'
import { saveRosterSchema } from '../../contracts/schemas'
import { packRuntimeData } from '../../contracts/runtimeData'
import { bookOf, system, points } from '../../server/catalogue.fixtures'
import { savedRosterPage, savedRosterPrice, homeRosters, rosterBootstrap, projectLocalState } from '../functions'
import { captureAppSnapshot, restoreAppSnapshot } from './appSnapshot'
import { priceQuery } from '../queries/rosters'
import { buildIndex } from '../../core/catalogue'
import type { LocalRoster } from './localRuntime'

const mocks = vi.hoisted(() => ({
  page: vi.fn(),
  home: vi.fn(),
  savedPrice: vi.fn(),
  price: vi.fn(),
  reference: vi.fn(),
  summaries: vi.fn(),
  owner: 'alice',
}))
vi.mock('../../server/functions', () => ({
  savedRosterPage: mocks.page,
  homeRosters: mocks.home,
  savedRosterPrice: mocks.savedPrice,
  priceRoster: mocks.price,
  savedRosterSummaries: mocks.summaries,
}))
vi.mock('./runtime', () => ({ referenceData: mocks.reference }))
vi.mock('../../core/catalogue', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../core/catalogue')>()
  return { ...actual, buildIndex: vi.fn(actual.buildIndex) }
})
const client = new QueryClient()
let state = emptyLocalState('alice')
const engine = {
  storage: {
    read: async () => structuredClone(state),
    change: async (update: (current: typeof state) => typeof state) => {
      state = update(state)
      return structuredClone(state)
    },
  },
}
vi.mock('./localRuntime', () => ({
  localOwner: () => ({ id: mocks.owner }),
  localClient: () => client,
  localEngine: () => engine,
  localDocument: async (resource: string) => structuredClone(state.documents[resource]?.data),
  hasLocalChanges: async (resource: string) => state.operations.some((operation) => operation.resource === resource),
}))
const roster: LocalRoster = {
  ...saveRosterSchema.parse({
    name: 'Army',
    catalogueId: 'cat',
    detachmentIds: [],
    disposition: null,
    limit: 1000,
    picks: [{ entryId: 'unit' }],
    prep: null,
  }),
  id: 'army',
  createdAt: 1,
  updatedAt: 1,
  automaticName: false,
  baseRosterId: null,
  prep: null,
  waivedRules: [],
  optionalRules: [],
}
const row = { id: 'army', points: 80, problem: null, label: 'Army', changes: 0, differences: null }
function pending(data: LocalRoster | null) {
  state.documents['roster:army'] = { data, serverVersion: 1 }
  state.operations = [
    { id: 'edit', resource: 'roster:army', kind: data ? 'saveRoster' : 'deleteRoster', input: data, createdAt: 2, status: 'pending' },
  ]
}
beforeEach(() => {
  vi.clearAllMocks()
  mocks.price.mockReset()
  vi.stubGlobal('window', {})
  vi.stubGlobal('navigator', { onLine: true })
  mocks.owner = 'alice'
  state = emptyLocalState('alice')
  state.documents['roster:army'] = { data: roster, serverVersion: 1 }
  client.clear()
  client.setQueryData(['me'], { id: 'alice' })
  const catalogue = bookOf({ selectionEntries: [{ id: 'unit', name: 'Unit', type: 'model', costs: points(80) }] })
  mocks.reference.mockReturnValue({
    queries: [],
    construction: {
      version: 1,
      revision: 'first',
      files: [
        system,
        { catalogue: { id: 'cat', name: 'Catalogue', selectionEntries: [{ id: 'unit', name: 'Unit', type: 'model', costs: points(80) }] } },
      ],
      datacards: packRuntimeData(catalogue.datacards),
      mfm: packRuntimeData(null),
      rules: packRuntimeData({
        factionKeys: new Map(),
        detachmentReferences: new Map(),
        detachmentDetails: new Map(),
        factionRestrictions: new Map(),
      }),
    },
  })
  mocks.summaries.mockResolvedValue([roster])
  mocks.page.mockResolvedValue([row])
  mocks.home.mockResolvedValue({ count: 1, rosters: [{ roster, ...row }] })
  vi.mocked(buildIndex).mockClear()
})
afterEach(() => vi.unstubAllGlobals())

it('uses one server batch without inspecting downloaded rules for clean library rows', async () => {
  const result = await savedRosterPage({ data: { ids: ['army'] } })
  expect({ result, requests: mocks.page.mock.calls.length, rules: vi.mocked(buildIndex).mock.calls.length }).toEqual({
    result: [row],
    requests: 1,
    rules: 0,
  })
})

it('uses the server Home calculation without rebuilding the local catalogue', async () => {
  const result = await homeRosters()
  expect({
    points: result.rosters[0]?.points,
    requests: mocks.home.mock.calls.length,
    rules: vi.mocked(buildIndex).mock.calls.length,
  }).toEqual({
    points: 80,
    requests: 1,
    rules: 0,
  })
})

it('prices the actual unsynced choices on the server instead of returning the older saved price', async () => {
  pending({ ...roster, updatedAt: 2, picks: [...roster.picks, ...roster.picks] })
  mocks.price.mockResolvedValue({ points: 160, errors: [], unhandled: [], label: 'Army' })
  const result = await savedRosterPrice({ data: { id: 'army' } })
  expect({
    points: result?.points,
    choices: mocks.price.mock.calls[0]?.[0].data.units.length,
    savedReads: mocks.savedPrice.mock.calls.length,
    rules: vi.mocked(buildIndex).mock.calls.length,
  }).toEqual({ points: 160, choices: 2, savedReads: 0, rules: 0 })
})

it('overlays a server library batch with server pricing for unsynced choices', async () => {
  pending({ ...roster, updatedAt: 2, picks: [...roster.picks, ...roster.picks] })
  mocks.price.mockResolvedValue({ points: 160, errors: [], unhandled: [], label: 'Army' })
  expect((await savedRosterPage({ data: { ids: ['army'] } }))[0]?.points).toBe(160)
})

it('does not resurrect a locally deleted roster from a server batch', async () => {
  pending(null)
  expect(await savedRosterPage({ data: { ids: ['army'] } })).toEqual([])
})

it('calculates real offline points and legality from unsynced choices without making requests', async () => {
  vi.stubGlobal('navigator', { onLine: false })
  pending({ ...roster, updatedAt: 2, limit: 100, picks: [...roster.picks, ...roster.picks] })
  const result = await savedRosterPage({ data: { ids: ['army'] } })
  expect({ points: result[0]?.points, problem: result[0]?.problem, requests: mocks.page.mock.calls.length }).toEqual({
    points: 160,
    problem: 'over-limit',
    requests: 0,
  })
})

it('calculates library points locally after a failed connected request', async () => {
  mocks.page.mockRejectedValue(new TypeError('Failed to fetch'))
  expect((await savedRosterPage({ data: { ids: ['army'] } }))[0]?.points).toBe(80)
})

it('retains an acknowledged edit made while the server batch was in flight', async () => {
  let finish!: (rows: (typeof row)[]) => void
  mocks.page.mockReturnValue(
    new Promise((resolve) => {
      finish = resolve
    }),
  )
  mocks.price.mockResolvedValue({ points: 160, errors: [], unhandled: [], label: 'Army' })
  const result = savedRosterPage({ data: { ids: ['army'] } })
  await vi.waitFor(() => expect(mocks.page).toHaveBeenCalledOnce())
  state.documents['roster:army'] = { data: { ...roster, updatedAt: 2, picks: [...roster.picks, ...roster.picks] }, serverVersion: 2 }
  finish([row])
  expect((await result)[0]?.points).toBe(160)
})

it('rejects an old account batch rather than giving it to the new account', async () => {
  mocks.page.mockImplementation(async () => {
    mocks.owner = 'bob'
    return [row]
  })
  await expect(savedRosterPage({ data: { ids: ['army'] } })).rejects.toThrow('account changed')
})

it('does not calculate clean downloaded roster projections when restoring work online', () => {
  projectLocalState(state)
  expect({ bootstrap: client.getQueryData(['roster-bootstrap', 'army', null]), rules: vi.mocked(buildIndex).mock.calls.length }).toEqual({
    bootstrap: undefined,
    rules: 0,
  })
})

it('persists a server price with its exact choices so it is immediately available after reload', async () => {
  const data = { points: 80, errors: [], label: 'Army' }
  mocks.price.mockResolvedValue(data)
  const query = priceQuery('cat', [], null, 1000, roster.picks)
  await client.query(query)
  const restored = new QueryClient()
  restoreAppSnapshot(restored, captureAppSnapshot(client)!)
  expect({
    cached: restored.getQueryData(query.queryKey),
    changed: restored.getQueryData(priceQuery('cat', [], null, 1000, [...roster.picks, ...roster.picks]).queryKey),
    rules: vi.mocked(buildIndex).mock.calls.length,
  }).toEqual({ cached: data, changed: undefined, rules: 0 })
})

it('uses the saved server price directly when there are no unsynced choices', async () => {
  mocks.savedPrice.mockResolvedValue({ points: 80 })
  const result = await savedRosterPrice({ data: { id: 'army' } })
  expect({ points: result?.points, requests: mocks.savedPrice.mock.calls.length, rules: vi.mocked(buildIndex).mock.calls.length }).toEqual({
    points: 80,
    requests: 1,
    rules: 0,
  })
})

it('calculates the saved roster locally after a connected pricing request fails', async () => {
  mocks.savedPrice.mockRejectedValue(new TypeError('Failed to fetch'))
  expect((await savedRosterPrice({ data: { id: 'army' } }))?.points).toBe(80)
})

it('keeps the server error when the rules needed for a local fallback were never downloaded', async () => {
  mocks.reference.mockReturnValue(undefined)
  mocks.page.mockRejectedValue(new TypeError('Failed to fetch'))
  await expect(savedRosterPage({ data: { ids: ['army'] } })).rejects.toThrow('Failed to fetch')
})

it('keeps cached server library points offline before the roster document has finished downloading', async () => {
  vi.stubGlobal('navigator', { onLine: false })
  state.documents = {}
  client.setQueryData(['saved-roster-page', ['army']], [row])
  expect(await savedRosterPage({ data: { ids: ['army'] } })).toEqual([row])
})

it('keeps cached Home prices offline before roster documents have finished downloading', async () => {
  vi.stubGlobal('navigator', { onLine: false })
  state.documents = {}
  client.setQueryData(['saved-roster-summaries'], [roster])
  client.setQueryData(['home-rosters'], { count: 1, rosters: [{ roster, points: 80, problem: null, label: 'Army' }] })
  expect((await homeRosters()).rosters[0]?.points).toBe(80)
})

it.each([0, 1, 2])('shows %s rosters on Home after a pending deletion and locally created replacements', async (count) => {
  pending(null)
  for (let index = 0; index < count; index++) {
    const created = { ...roster, id: `new-${index}`, updatedAt: 2 }
    state.documents[`roster:${created.id}`] = { data: created, serverVersion: null }
    state.operations.push({
      id: created.id,
      kind: 'saveRoster',
      resource: `roster:${created.id}`,
      input: created,
      createdAt: 2,
      status: 'pending',
    })
  }
  mocks.price.mockResolvedValue({ points: 80, errors: [], unhandled: [], label: 'Army' })
  const home = await homeRosters()
  expect({ count: home.count, priced: home.rosters.map((entry) => entry.points) }).toEqual({
    count,
    priced: Array.from({ length: count }, () => 80),
  })
})

it('rejects a pending roster bootstrap if the account changes during server pricing', async () => {
  pending(roster)
  let finish!: (value: unknown) => void
  mocks.price.mockReturnValue(
    new Promise((resolve) => {
      finish = resolve
    }),
  )
  const result = rosterBootstrap({ data: { id: 'army' } })
  await vi.waitFor(() => expect(mocks.price).toHaveBeenCalledOnce())
  mocks.owner = 'bob'
  finish({ points: 80 })
  await expect(result).rejects.toThrow('account changed')
})

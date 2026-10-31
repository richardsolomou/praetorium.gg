import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import type { ConstructionWorkerAnswer, ConstructionWorkerRequest } from './construction.worker'

const mocks = vi.hoisted(() => ({
  part: vi.fn(),
  candidates: vi.fn(),
  read: vi.fn(),
  source: vi.fn(),
  steps: vi.fn(),
}))

vi.mock('./referenceStore', () => ({ readPart: mocks.part }))
vi.mock('../../shared/combatLoadouts', () => ({ combatLoadoutCandidates: mocks.candidates }))
vi.mock('./constructionSource', async (actual) => ({
  loadConstructionData: (await actual<typeof import('./constructionSource')>()).loadConstructionData,
  constructionSource: mocks.source,
  buildConstruction: () => ({ catalogue: {}, rules: {} }),
  runConstructionRead: mocks.read,
}))
vi.mock('../../shared/pickerUnits', () => ({ pickerConstruction: mocks.steps }))
vi.mock('../../shared/rosterTelemetry', async (actual) => ({
  ...(await actual<typeof import('../../shared/rosterTelemetry')>()),
  rosterPricedProperties: () => ({ unit_count: 1 }),
}))

let posted: ConstructionWorkerAnswer[]
let handle: (request: ConstructionWorkerRequest) => Promise<unknown>

beforeEach(async () => {
  vi.resetModules()
  posted = []
  mocks.part.mockImplementation(async (asset: string) => {
    if (!(asset in PARTS)) throw new Error('This part of the download is unavailable')
    return structuredClone(PARTS[asset])
  })
  mocks.source.mockReturnValue({ revision: 'base' })
  mocks.read.mockReturnValue('answer')
  mocks.steps.mockImplementation(function* () {})
  const scope: {
    onmessage?: (event: { data: ConstructionWorkerRequest }) => Promise<unknown>
    postMessage: (answer: ConstructionWorkerAnswer) => void
  } = {
    postMessage: (answer) => posted.push(answer),
  }
  vi.stubGlobal('self', scope)
  await import('./construction.worker')
  handle = (request) => scope.onmessage!({ data: request })
})
afterEach(() => vi.unstubAllGlobals())

const source = { id: 'download', parts: { catalogue: '/catalogue', rules: '/rules', editions: { mfm: '/mfm' } } }
const PARTS: Record<string, unknown> = {
  '/catalogue': { version: 1, revision: 'base', files: [], datacards: {}, mfm: null, editions: [] },
  '/rules': { revision: 'base', rules: {} },
}
const prepare = (catalogueId = 'cat') =>
  handle({ kind: 'prepare', source, catalogueId, units: true, keys: ['build:', `units:${catalogueId}`] })
/** A read after its preparation, which is when the page sends one; answers before it are dropped. */
const read = async (name: Extract<ConstructionWorkerRequest, { kind: 'read' }>['name'] = 'unitWounds') => {
  await prepare()
  posted = []
  return handle({ kind: 'read', id: 1, name, data: {}, catalogueId: 'cat' })
}

it('answers a read from the downloaded construction data', async () => {
  await read()
  expect(posted).toEqual([{ id: 1, value: 'answer' }])
})

it('reports a read the rules cannot answer without giving up on the download', async () => {
  mocks.read.mockImplementation(() => {
    throw new Error('Unknown datasheet')
  })
  await read()
  expect(posted).toEqual([{ id: 1, error: 'Unknown datasheet' }])
})

it('gives up on a download whose current rules it cannot read', async () => {
  mocks.part.mockRejectedValue(new Error('offline'))
  await prepare()
  expect(posted.some((answer) => 'unavailable' in answer)).toBe(true)
})

it('keeps the download for the current rules when another rules version cannot be read', async () => {
  await prepare('mfm~cat')
  expect(posted).toEqual([{ unprepared: ['build:', 'units:mfm~cat'] }])
})

it('streams a loadout search a batch at a time, as the page asks', async () => {
  mocks.candidates.mockImplementation(async function* () {
    yield { candidates: [], built: 1, scheduled: 1, done: false }
  })
  await prepare()
  posted = []
  await handle({
    kind: 'search',
    id: 2,
    source,
    input: { catalogueId: 'cat', picks: [{ entryId: 'unit' }], pickIndex: 0 },
    catalogueId: 'cat',
  })
  await handle({ kind: 'next', id: 2 })
  expect(posted).toEqual([
    { id: 2, batch: { candidates: [], built: 1, scheduled: 1, done: false } },
    { id: 2, done: true },
  ])
})

it('reports a loadout search that cannot finish', async () => {
  mocks.candidates.mockReturnValue({ next: () => Promise.reject(new Error('The full search could not finish.')) })
  await prepare()
  posted = []
  await handle({
    kind: 'search',
    id: 2,
    source,
    input: { catalogueId: 'cat', picks: [{ entryId: 'unit' }], pickIndex: 0 },
    catalogueId: 'cat',
  })
  expect(posted).toEqual([{ id: 2, error: 'The full search could not finish.' }])
})

it('reports the keys it prepared once a faction is ready', async () => {
  await prepare()
  expect(posted).toEqual([{ prepared: ['build:', 'units:cat'] }])
})

it('reports a preparation it could not finish without giving up on the download', async () => {
  mocks.source.mockReturnValue(undefined)
  await prepare('mfm~cat')
  expect(posted).toEqual([{ unprepared: ['build:', 'units:mfm~cat'] }])
})

it('sends the event the server records for a read, with how long the device took', async () => {
  await read('priceRoster')
  expect(posted[0]).toMatchObject({ event: { name: 'roster_priced', properties: { unit_count: 1, duration_ms: expect.any(Number) } } })
})

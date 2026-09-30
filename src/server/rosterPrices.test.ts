import { beforeEach, expect, it, vi } from 'vitest'
import { bookOf } from './catalogue.fixtures'
import { cachedRosterAssessmentsFor, cachedRosterPrice, cachedRosterTotalsFor, cachedRosterVerdictsFor } from './rosterPrices'

const reads = vi.hoisted(() => ({
  factionIndexFor: vi.fn(),
  rosterLabelRulesFor: vi.fn(),
  catalogueFor: vi.fn(),
  rulesFor: vi.fn(),
}))

vi.mock('./app', () => ({ app: () => reads }))

const roster = (id: string) => ({
  id,
  updatedAt: 1,
  catalogueId: 'cat',
  detachmentIds: [],
  disposition: null,
  limit: 2_000,
  picks: [],
  waivedRules: [],
})
const priceable = (id: string) => ({ ...roster(id), optionalRules: [], borrowedDetachmentId: null })

beforeEach(() => {
  vi.clearAllMocks()
  reads.factionIndexFor.mockResolvedValue({ revision: 'batch-test' })
  reads.rosterLabelRulesFor.mockResolvedValue({ factionNames: new Map() })
  reads.catalogueFor.mockResolvedValue(bookOf({}))
  reads.rulesFor.mockResolvedValue({
    factionNames: new Map(),
    factionKeys: new Map(),
    detachmentReferences: new Map(),
    detachmentDetails: new Map(),
    factionRestrictions: new Map(),
  })
})

it('loads one faction catalogue for several saved roster totals', async () => {
  const values = await cachedRosterTotalsFor([roster('batch-one'), roster('batch-two')])
  expect({ points: values.map((value) => value?.points), reads: reads.catalogueFor.mock.calls.length }).toEqual({
    points: [0, 0],
    reads: 1,
  })
})

it('reuses current totals without loading the faction again', async () => {
  await cachedRosterTotalsFor([roster('batch-repeat')])
  await cachedRosterTotalsFor([roster('batch-repeat')])
  expect(reads.catalogueFor).toHaveBeenCalledTimes(1)
})

it('returns the saved name with its totals', async () => {
  const [totals] = await cachedRosterTotalsFor([{ ...roster('stored-name'), name: 'My army' }])
  expect(totals?.label).toBe('My army')
})

it('retries totals when a faction read fails', async () => {
  reads.catalogueFor.mockRejectedValueOnce(new Error('faction unavailable'))
  await expect(cachedRosterTotalsFor([roster('batch-retry')])).rejects.toThrow('faction unavailable')
  await expect(cachedRosterTotalsFor([roster('batch-retry')])).resolves.toMatchObject([{ points: 0 }])
})

it('loads one faction catalogue for several saved roster verdicts', async () => {
  const values = await cachedRosterVerdictsFor([priceable('verdict-one'), priceable('verdict-two')])
  expect({ count: values.length, reads: reads.catalogueFor.mock.calls.length }).toEqual({ count: 2, reads: 1 })
})

it('reuses one full evaluation for library points and legality', async () => {
  reads.catalogueFor.mockResolvedValueOnce({
    ...bookOf({}),
    factions: [{ id: 'cat', name: 'Test catalogue', references: [] }],
  })
  const saved = priceable('page-assessment')
  const [assessment] = await cachedRosterAssessmentsFor([saved])
  expect(assessment).toMatchObject({ points: 0, verdict: { problem: null } })
  await cachedRosterVerdictsFor([saved])
  expect(reads.catalogueFor).toHaveBeenCalledTimes(1)
})

it('does not guess legality without rules', async () => {
  reads.rulesFor.mockResolvedValueOnce(null)
  await cachedRosterVerdictsFor([priceable('verdict-no-rules')])
  expect(reads.catalogueFor).not.toHaveBeenCalled()
})

it('starts a saved roster catalogue and rules read together', async () => {
  const started: string[] = []
  let release!: () => void
  const ready = new Promise<void>((resolve) => {
    release = resolve
  })
  reads.catalogueFor.mockImplementation(async () => {
    started.push('catalogue')
    await ready
    return bookOf({})
  })
  reads.rulesFor.mockImplementation(async () => {
    started.push('rules')
    await ready
    return null
  })
  const pricing = cachedRosterPrice(priceable('price-parallel'))
  try {
    await vi.waitFor(() => expect(started).toEqual(['catalogue', 'rules']))
  } finally {
    release()
  }
  await pricing
})

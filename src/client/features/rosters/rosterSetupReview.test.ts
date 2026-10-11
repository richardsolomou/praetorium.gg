import { beforeEach, expect, it, vi } from 'vitest'
import { reviewRosterSetup, verifySetupReview } from './rosterSetupReview'
import { saveRosterSchema } from '../../../contracts/schemas'

const mocks = vi.hoisted(() => ({ price: vi.fn(), load: vi.fn(), owner: 'alice' as string | null, serverOnly: false }))
vi.mock('../../functions', () => ({ priceRoster: mocks.price, sharedRoster: mocks.load }))
vi.mock('../../offline/localRuntime', () => ({
  localOwner: () => (mocks.owner ? { id: mocks.owner } : null),
  localEngine: () => (mocks.serverOnly ? null : {}),
}))
const source = saveRosterSchema.parse({
  id: 'army',
  name: 'Army',
  catalogueId: 'cat',
  detachmentIds: ['first', 'second'],
  disposition: 'disposition',
  limit: 2000,
  picks: [
    { entryId: 'captain', choices: { weapon: 'sword', relic: 'relic' } },
    { entryId: 'ally', catalogueId: 'allies', attachedTo: 0 },
  ],
  prep: null,
})
const setup = {
  name: source.name,
  catalogueId: source.catalogueId,
  detachmentIds: ['first'],
  disposition: null,
  limit: 1000,
  waivedRules: [],
  optionalRules: [],
  borrowedDetachmentId: null,
  visibility: 'private' as const,
}
const priced = {
  revision: 'rules-a',
  points: 1200,
  units: [
    { key: 0, choices: [{ key: 'weapon' }, { key: 'relic', kind: 'enhancement' }] },
    { key: 1, choices: [] },
  ],
}
beforeEach(() => {
  vi.resetAllMocks()
  mocks.owner = 'alice'
  mocks.serverOnly = false
  mocks.price.mockResolvedValue(priced)
})

it('prices and keeps one immutable candidate with the authoritative removal transition', async () => {
  const reviewed = await reviewRosterSetup(source, setup)
  setup.detachmentIds.push('third')
  expect({
    original: source.picks[0]?.choices,
    candidate: reviewed.candidate,
    pricedInput: mocks.price.mock.calls[1]?.[0].data.units,
  }).toEqual({
    original: { weapon: 'sword', relic: 'relic' },
    candidate: {
      ...source,
      ...setup,
      detachmentIds: ['first'],
      picks: [{ entryId: 'captain', choices: { weapon: 'sword' } }, source.picks[1]],
    },
    pricedInput: [{ entryId: 'captain', choices: { weapon: 'sword' } }, source.picks[1]],
  })
  setup.detachmentIds.pop()
})

it('does not clear a different unit when source pricing omits an unavailable entry', async () => {
  mocks.price.mockResolvedValue({ ...priced, units: [{ key: 1, choices: [{ key: 'weapon', kind: 'enhancement' }] }] })
  expect((await reviewRosterSetup(source, setup)).candidate.picks[0]?.choices).toEqual(source.picks[0]?.choices)
})

it('refuses confirmation after a pricing revision changes', async () => {
  const reviewed = await reviewRosterSetup(source, setup)
  mocks.price.mockResolvedValue({ ...priced, revision: 'rules-b' })
  await expect(verifySetupReview(reviewed)).rejects.toThrow('rules or points changed')
})

it('refuses confirmation when the account switches during pricing', async () => {
  const reviewed = await reviewRosterSetup(source, setup)
  mocks.price.mockImplementation(async () => {
    mocks.owner = 'bob'
    return priced
  })
  await expect(verifySetupReview(reviewed)).rejects.toThrow('account changed')
})

it('retains the library roster that was loaded for review rather than loading a later copy at save', async () => {
  mocks.load.mockResolvedValue({ ...source, automaticName: false, prep: null })
  const reviewed = await reviewRosterSetup('army', setup)
  expect({ source: reviewed.source.picks, loads: mocks.load.mock.calls.length, candidate: reviewed.candidate.picks[0]?.choices }).toEqual({
    source: source.picks,
    loads: 1,
    candidate: { weapon: 'sword' },
  })
})

it('captures one server version and stable receipt when durable local state is unavailable', async () => {
  mocks.serverOnly = true
  mocks.load.mockResolvedValue({ ...source, updatedAt: 7 })
  const reviewed = await reviewRosterSetup(source, setup)
  await verifySetupReview(reviewed)
  expect({
    version: reviewed.serverSave?.expectedVersion,
    receipt: reviewed.serverSave?.operationId,
    reads: mocks.load.mock.calls.length,
  }).toEqual({
    version: 7,
    receipt: expect.any(String),
    reads: 1,
  })
})

it('refuses to review a displayed server-only baseline that already changed', async () => {
  mocks.serverOnly = true
  mocks.load.mockResolvedValue({ ...source, name: 'Changed', updatedAt: 8 })
  await expect(reviewRosterSetup(source, setup)).rejects.toThrow('changed after your review')
})

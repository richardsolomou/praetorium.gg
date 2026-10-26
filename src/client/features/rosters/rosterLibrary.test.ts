import { beforeEach, expect, it, vi } from 'vitest'
import { useRosterActions } from './rosterLibrary'
import type { RosterSetup } from './RosterSetupDialog'
import type { RosterPick } from '../../../core/roster'
import { saveRosterSchema } from '../../../contracts/schemas'
import { reviewRosterSetup, type RosterSetupReview } from './rosterSetupReview'

const reads = vi.hoisted(() => ({ sharedRoster: vi.fn(), saveRoster: vi.fn(), priceRoster: vi.fn(), exportRoster: vi.fn() }))
vi.mock('../../functions', () => ({
  ...reads,
  copyRoster: vi.fn(),
  deleteRoster: vi.fn(),
  setRosterVisibility: vi.fn(),
}))
vi.mock('@tanstack/react-query', () => ({ useMutation: (options: unknown) => options, useQueryClient: () => ({}) }))
vi.mock('@tanstack/react-router', () => ({ useNavigate: () => vi.fn() }))
vi.mock('react', () => ({ useState: () => [null, vi.fn()] }))
vi.mock('../../queries', () => ({ invalidateSavedRosters: vi.fn(), savedRosterSummariesQuery: vi.fn() }))
vi.mock('../../nativeBridge', () => ({ shareLink: vi.fn() }))
vi.mock('../../offline/localRuntime', () => ({ localOwner: () => ({ id: 'alice' }), localEngine: () => ({}) }))

beforeEach(() => {
  vi.resetAllMocks()
  reads.priceRoster.mockImplementation(async ({ data }: { data: { units: RosterPick[] } }) => ({
    revision: 'rules-a',
    points: 1000,
    units: data.units.map((_pick, key) => ({ key, choices: [] })),
  }))
})

function action() {
  return useRosterActions('https://praetorium.gg').update as unknown as {
    mutationFn: (review: RosterSetupReview) => Promise<unknown>
  }
}

const source = saveRosterSchema.parse({
  id: 'saved',
  name: 'My roster',
  catalogueId: 'custodes',
  detachmentIds: ['first'],
  disposition: 'priority-assets',
  limit: 2000,
  pointsBudget: null,
  picks: [],
  prep: null,
  waivedRules: [],
  optionalRules: [],
})

const setup: RosterSetup = {
  name: source.name,
  catalogueId: source.catalogueId,
  detachmentIds: source.detachmentIds,
  disposition: source.disposition,
  limit: source.limit,
  pointsBudget: null,
  visibility: source.visibility,
  waivedRules: source.waivedRules ?? [],
  optionalRules: source.optionalRules ?? [],
  borrowedDetachmentId: source.borrowedDetachmentId,
}

async function update(catalogueId: string, picks: RosterPick[], nextCatalogueId: string) {
  reads.sharedRoster.mockResolvedValue({ ...source, catalogueId, picks })
  const review = await reviewRosterSetup('saved', { ...setup, catalogueId: nextCatalogueId })
  await action().mutationFn(review)
  return reads.saveRoster.mock.calls[0]![0].data.picks
}

it.each([0, 1, 3])('retains %i units and their choices when library setup switches rules version', async (count) => {
  const picks = Array.from({ length: count }, (_, index) => ({ entryId: `guard-${index}`, choices: { weapon: 'spear' } }))
  expect(await update('custodes', picks, 'preview~custodes')).toEqual(picks)
})

it('keeps unit nicknames and notes when library setup switches rules version', async () => {
  const picks = [
    { entryId: 'guard', nickname: 'Shield of Dawn', note: 'Screen the left objective.' },
    { entryId: 'guard', nickname: 'Shield of Dusk' },
  ]
  expect(await update('custodes', picks, 'preview~custodes')).toEqual(picks)
})

it('remaps allied catalogue identities without losing attachments or equipment', async () => {
  expect(
    await update('preview~custodes', [{ entryId: 'ally', catalogueId: 'preview~agents', attachedTo: 0, models: 5 }], 'custodes'),
  ).toEqual([{ entryId: 'ally', catalogueId: 'agents', attachedTo: 0, models: 5 }])
})

it('removes units when library setup chooses another faction', async () => {
  expect(await update('custodes', [{ entryId: 'guard' }], 'marines')).toEqual([])
})

it('converts the existing roster ID with its preparation and source intact', async () => {
  const prep = { stratagems: [], secondaries: [], remindersEnabled: true }
  reads.sharedRoster.mockResolvedValue({ ...source, picks: [{ entryId: 'guard' }], prep })
  const review = await reviewRosterSetup('saved', { ...setup, catalogueId: 'preview~custodes' })
  await action().mutationFn(review)
  expect(reads.saveRoster.mock.calls[0]![0].data).toStrictEqual({
    ...source,
    catalogueId: 'preview~custodes',
    picks: [{ entryId: 'guard' }],
    prep,
    source: 'editable',
  })
})

it('saves the exact reviewed candidate and forwards its source, owner and server receipt without another read', async () => {
  reads.sharedRoster.mockResolvedValue(source)
  const review = await reviewRosterSetup('saved', { ...setup, name: 'Reviewed name' })
  const receipt = { expectedVersion: 7, operationId: '3127aef0-4077-4b5d-bc87-66666159621b' }
  review.serverSave = receipt
  reads.sharedRoster.mockResolvedValue({ ...source, name: 'Changed later' })
  await action().mutationFn(review)
  expect({ loads: reads.sharedRoster.mock.calls.length, save: reads.saveRoster.mock.calls[0] }).toStrictEqual({
    loads: 1,
    save: [{ data: { ...source, name: 'Reviewed name' } }, source, 'alice', receipt],
  })
})

it('keeps a refused reviewed library save as a failure', async () => {
  reads.sharedRoster.mockResolvedValue(source)
  const review = await reviewRosterSetup('saved', { ...setup, limit: 1000 })
  reads.saveRoster.mockRejectedValue(new Error('This roster changed after your review.'))
  await expect(action().mutationFn(review)).rejects.toThrow('changed after your review')
})

it('exports a library roster with its agreed points limit', async () => {
  reads.sharedRoster.mockResolvedValue({ ...source, pointsBudget: 1750 })
  const take = useRosterActions('https://praetorium.gg').take as unknown as {
    mutationFn: (input: { roster: { id: string }; title: string }) => Promise<unknown>
  }
  await take.mutationFn({ roster: { id: 'saved' }, title: 'Untitled' })
  expect(reads.exportRoster.mock.calls[0]![0].data.pointsBudget).toBe(1750)
})

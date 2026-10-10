import { expect, it, vi } from 'vitest'
import { bookOf, points } from '../../server/catalogue.fixtures'
import { saveRosterSchema } from '../../contracts/schemas'
import { localRosterAssessment } from './rosterAssessment'
import type { LocalRoster } from './localRuntime'

const mocks = vi.hoisted(() => ({ construction: vi.fn() }))
vi.mock('./construction', () => ({ localConstruction: mocks.construction }))
function prepare(cost: number, revision: string) {
  const catalogue = bookOf({ selectionEntries: [{ id: 'unit', name: 'Unit', type: 'model', costs: points(cost) }] })
  mocks.construction.mockReturnValue({
    revision,
    catalogue,
    rules: { factionKeys: new Map(), detachmentReferences: new Map(), detachmentDetails: new Map(), factionRestrictions: new Map() },
  })
}
function roster(): LocalRoster {
  return {
    ...saveRosterSchema.parse({
      name: 'Army',
      catalogueId: 'cat',
      detachmentIds: [],
      disposition: null,
      limit: 1000,
      picks: [{ entryId: 'unit' }],
      prep: null,
    }),
    id: crypto.randomUUID(),
    createdAt: 1,
    updatedAt: 1,
    automaticName: false,
    baseRosterId: null,
    prep: null,
    waivedRules: [],
    optionalRules: [],
  }
}
it('reports real points and legality without full unit projections', async () => {
  prepare(1001, 'first')
  expect(await localRosterAssessment(roster(), 'alice')).toEqual({ points: 1001, problem: 'over-limit', label: 'Army' })
})
it('reuses an unchanged roster assessment across background refreshes', async () => {
  prepare(80, 'first')
  const saved = roster()
  const first = await localRosterAssessment(saved, 'alice')
  expect(await localRosterAssessment(structuredClone(saved), 'alice')).toBe(first)
})
it('reassesses a saved edit even with the same catalogue revision', async () => {
  prepare(80, 'first')
  const saved = roster()
  await localRosterAssessment(saved, 'alice')
  expect((await localRosterAssessment({ ...saved, updatedAt: 2, picks: [...saved.picks, ...saved.picks] }, 'alice')).points).toBe(160)
})
it('reassesses an unchanged roster when the downloaded catalogue changes', async () => {
  prepare(80, 'first')
  const saved = roster()
  await localRosterAssessment(saved, 'alice')
  prepare(1001, 'second')
  expect(await localRosterAssessment(saved, 'alice')).toEqual({ points: 1001, problem: 'over-limit', label: 'Army' })
})

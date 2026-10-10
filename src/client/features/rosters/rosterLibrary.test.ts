import { beforeEach, expect, it, vi } from 'vitest'
import { useRosterActions, type SavedRoster } from './rosterLibrary'
import type { RosterSetup } from './RosterSetupDialog'
import type { RosterPick } from '../../../core/roster'

const reads = vi.hoisted(() => ({ sharedRoster: vi.fn(), saveRoster: vi.fn() }))
vi.mock('../../functions', () => ({
  ...reads,
  copyRoster: vi.fn(),
  deleteRoster: vi.fn(),
  exportRoster: vi.fn(),
  setRosterVisibility: vi.fn(),
}))
vi.mock('@tanstack/react-query', () => ({ useMutation: (options: unknown) => options, useQueryClient: () => ({}) }))
vi.mock('@tanstack/react-router', () => ({ useNavigate: () => vi.fn() }))
vi.mock('react', () => ({ useState: () => [null, vi.fn()] }))
vi.mock('../../queries', () => ({ invalidateSavedRosters: vi.fn(), savedRosterSummariesQuery: vi.fn() }))
vi.mock('../../nativeBridge', () => ({ shareLink: vi.fn() }))

beforeEach(() => vi.clearAllMocks())

async function update(catalogueId: string, picks: RosterPick[], nextCatalogueId: string) {
  reads.sharedRoster.mockResolvedValue({ id: 'saved', catalogueId, picks, prep: null, source: 'editable' })
  const action = useRosterActions('https://praetorium.gg').update as unknown as {
    mutationFn: (input: { roster: SavedRoster; setup: RosterSetup }) => Promise<unknown>
  }
  await action.mutationFn({ roster: { id: 'saved' } as SavedRoster, setup: { catalogueId: nextCatalogueId } as RosterSetup })
  return reads.saveRoster.mock.calls[0]![0].data.picks
}

it.each([0, 1, 3])('retains %i units and their choices when library setup switches rules version', async (count) => {
  const picks = Array.from({ length: count }, (_, index) => ({ entryId: `guard-${index}`, choices: { weapon: 'spear' } }))
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
  const prep = { stratagems: [], secondaries: [], reminders: [], remindersEnabled: true }
  reads.sharedRoster.mockResolvedValue({ id: 'saved', catalogueId: 'custodes', picks: [{ entryId: 'guard' }], prep, source: 'editable' })
  const action = useRosterActions('https://praetorium.gg').update as unknown as {
    mutationFn: (input: { roster: SavedRoster; setup: RosterSetup }) => Promise<unknown>
  }
  const setup = { catalogueId: 'preview~custodes', name: 'My roster', limit: 2000, visibility: 'private' } as RosterSetup
  await action.mutationFn({ roster: { id: 'saved' } as SavedRoster, setup })
  expect(reads.saveRoster.mock.calls[0]![0].data).toEqual({
    id: 'saved',
    ...setup,
    picks: [{ entryId: 'guard' }],
    prep,
    source: 'editable',
  })
})

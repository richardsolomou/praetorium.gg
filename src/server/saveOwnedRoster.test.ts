import { beforeEach, expect, it, vi } from 'vitest'
import { app } from './app'
import { copyOwnedRoster } from './saveOwnedRoster'

vi.mock('./app', () => ({ app: vi.fn() }))

const base = {
  id: 'base',
  name: 'Gladius 2K',
  automaticName: false,
  baseRosterId: null as string | null,
  catalogueId: 'marines',
  detachmentIds: ['gladius'],
  disposition: 'take-and-hold',
  borrowedDetachmentId: 'armoury',
  limit: 2_000,
  picks: [{ entryId: 'captain' }],
  waivedRules: ['kotc-epic-heroes'],
  optionalRules: ['lone-operative'],
  prep: { stratagems: [], secondaries: [], reminders: [], remindersEnabled: true },
  visibility: 'public',
  source: 'editable',
}
const summary = (id: string, name: string, baseRosterId: string | null = 'base') => ({ ...base, id, name, baseRosterId })

let saveRoster: ReturnType<typeof vi.fn>
function library(rosters: (typeof base)[], editable = true) {
  saveRoster = vi.fn().mockResolvedValue({ id: 'copy', created: true, updatedAt: 1 })
  vi.mocked(app).mockReturnValue({
    service: {
      rosterAccess: vi.fn(async (id: string) => {
        const roster = rosters.find((candidate) => candidate.id === id)
        return roster ? { roster, editable } : null
      }),
      playerDefaults: vi.fn().mockResolvedValue({ rosterVisibility: 'private', battleSize: 2_000 }),
      rosterGroup: vi.fn(async (_userId: string, roster: typeof base) =>
        rosters.filter((saved) => (saved.baseRosterId ?? saved.id) === (roster.baseRosterId ?? roster.id)),
      ),
      saveRoster,
    },
    catalogueFor: async () => null,
    rosterLabelRulesFor: async () => null,
  } as never)
}
const saved = () => saveRoster.mock.calls[0]?.[1]

beforeEach(() => vi.mocked(app).mockReset())

it('copies the selected codex and its equipment without adopting the current default', async () => {
  const preview = {
    ...base,
    catalogueId: 'codex~marines',
    picks: [{ entryId: 'captain', catalogueId: 'codex~allies', choices: { weapon: 'spear' } }],
  }
  library([preview])
  await copyOwnedRoster('player', 'base', false)
  expect(saved()).toMatchObject({ catalogueId: preview.catalogueId, picks: preview.picks })
})

it('duplicates every choice of a roster at the default visibility, outside its group', async () => {
  library([base])
  await copyOwnedRoster('player', 'base', false)
  const { prep, picks, ...setup } = base
  expect(saved()).toEqual({
    ...setup,
    id: undefined,
    name: 'Copy of Gladius 2K',
    automaticName: false,
    baseRosterId: null,
    picks,
    prep,
    visibility: 'private',
  })
})

it('numbers a variant after its base and joins it to the base', async () => {
  library([base, summary('second', 'Gladius 2K · 2')])
  await copyOwnedRoster('player', 'base', true)
  expect(saved()).toMatchObject({ name: 'Gladius 2K · 3', baseRosterId: 'base' })
})

it('numbers a variant of a variant after the group base rather than the variant', async () => {
  library([base, summary('second', 'Gladius 2K · 2')])
  await copyOwnedRoster('player', 'second', true)
  expect(saved()?.name).toBe('Gladius 2K · 3')
})

it('names a variant of an automatically named roster automatically', async () => {
  library([{ ...base, name: 'G 2K - Captain', automaticName: true }])
  await copyOwnedRoster('player', 'base', true)
  expect(saved()).toMatchObject({ name: '', automaticName: true })
})

it('copies nothing from a roster the player does not own', async () => {
  library([base], false)
  expect(await copyOwnedRoster('player', 'base', true)).toBeNull()
})

import { beforeEach, expect, it, vi } from 'vitest'
import { app } from './app'
import { copySavedRoster } from './saveOwnedRoster'

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
      playerDefaults: vi.fn().mockResolvedValue({ rosterVisibility: 'private', battleSize: 2_000 }),
      rosterService: {
        rosterAccess: vi.fn(async (id: string) => {
          const roster = rosters.find((candidate) => candidate.id === id)
          return roster ? { roster, editable } : null
        }),
        rosterGroup: vi.fn(async (_userId: string, roster: typeof base) =>
          rosters.filter((saved) => (saved.baseRosterId ?? saved.id) === (roster.baseRosterId ?? roster.id)),
        ),
        saveRoster,
      },
    },
    catalogueFor: async () => null,
    rulesFor: async () => null,
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
  await copySavedRoster('player', 'base', false)
  expect(saved()).toMatchObject({ catalogueId: preview.catalogueId, picks: preview.picks })
})

it('duplicates every choice of a roster at the default visibility, outside its group', async () => {
  library([base])
  await copySavedRoster('player', 'base', false)
  const { prep, picks, ...setup } = base
  expect(saved()).toEqual({
    ...setup,
    id: undefined,
    name: 'Copy of Gladius 2K',
    automaticName: false,
    baseRosterId: null,
    copiedFromRosterId: 'base',
    picks,
    prep,
    visibility: 'private',
  })
})

it('records no copy source on a variant, which already names its base', async () => {
  library([base])
  await copySavedRoster('player', 'base', true)
  expect(saved()).toMatchObject({ baseRosterId: 'base', copiedFromRosterId: null })
})

it.each([false, true])('keeps unit nicknames and notes in a copy (variant: %s)', async (variant) => {
  const picks = [
    { entryId: 'intercessors', nickname: 'Alpha', note: 'Hold home.' },
    { entryId: 'intercessors', nickname: 'Bravo', note: 'Push midfield.' },
  ]
  library([{ ...base, picks }])
  await copySavedRoster('player', 'base', variant)
  expect(saved()?.picks).toEqual(picks)
})

it('numbers a variant after its base and joins it to the base', async () => {
  library([base, summary('second', 'Gladius 2K · 2')])
  await copySavedRoster('player', 'base', true)
  expect(saved()).toMatchObject({ name: 'Gladius 2K · 3', baseRosterId: 'base' })
})

it('numbers a variant of a variant after the group base rather than the variant', async () => {
  library([base, summary('second', 'Gladius 2K · 2')])
  await copySavedRoster('player', 'second', true)
  expect(saved()?.name).toBe('Gladius 2K · 3')
})

it('names a variant of an automatically named roster automatically', async () => {
  library([{ ...base, name: 'G 2K - Captain', automaticName: true }])
  await copySavedRoster('player', 'base', true)
  expect(saved()).toMatchObject({ name: '', automaticName: true })
})

it('makes no variant of a roster the player does not own', async () => {
  library([base], false)
  expect(await copySavedRoster('player', 'base', true)).toBeNull()
})

it("copies another player's readable roster into the reader's own list, outside any group", async () => {
  library([{ ...base, baseRosterId: null }], false)
  await copySavedRoster('player', 'base', false)
  expect(saved()).toMatchObject({ name: 'Copy of Gladius 2K', baseRosterId: null, visibility: 'private' })
})

it('copies nothing from a roster the player cannot read', async () => {
  library([], false)
  expect(await copySavedRoster('player', 'base', false)).toBeNull()
})

it('saves a reviewed conversion as a variant and leaves its name and access to the copy', async () => {
  library([base])
  const converted = {
    ...base,
    name: 'Ignored',
    catalogueId: 'codex~marines',
    picks: [{ entryId: 'captain', models: 1 }],
    waivedRules: [],
    optionalRules: [],
  }
  await copySavedRoster('player', 'base', true, converted as never)
  expect(saved()).toMatchObject({
    name: 'Gladius 2K · 2',
    visibility: 'private',
    baseRosterId: 'base',
    catalogueId: 'codex~marines',
    picks: converted.picks,
  })
})

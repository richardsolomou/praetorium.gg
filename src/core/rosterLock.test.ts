import { describe, expect, it } from 'vitest'
import { LOCKED_ROSTER_MESSAGE, lockedRosterRefusal, storedRosterContent, type RosterContent } from './rosterLock'
import { migrateSavedRoster, migrateStoredRoster } from './savedRosterMigrations'

const saved: RosterContent = {
  name: 'Tournament list',
  automaticName: false,
  catalogueId: 'necrons',
  detachmentIds: ['awakened-dynasty'],
  disposition: 'take-and-hold',
  limit: 2_000,
  picks: [{ entryId: 'overlord', choices: { weapon: 'staff' } }],
  prep: { stratagems: [], secondaries: [], reminders: [], remindersEnabled: true },
  waivedRules: [],
  optionalRules: [],
  borrowedDetachmentId: null,
}
const locked = { ...saved, locked: true }

describe('a save to a locked roster', () => {
  it.each<[string, Partial<RosterContent>]>([
    ['adding a unit', { picks: [...(saved.picks as unknown[]), { entryId: 'warriors' }] }],
    ['changing a loadout', { picks: [{ entryId: 'overlord', choices: { weapon: 'scythe' } }] }],
    ['changing the squad size', { picks: [{ entryId: 'overlord', choices: { weapon: 'staff' }, models: 2 }] }],
    ['changing detachments', { detachmentIds: ['hypercrypt-legion'] }],
    ['changing the force disposition', { disposition: 'purge-the-foe' }],
    ['changing the battle size', { limit: 1_000 }],
    ['setting a custom points budget', { pointsBudget: 1_500 }],
    ['waiving a construction rule', { waivedRules: ['points-limit'] }],
    ['choosing an optional rule', { optionalRules: ['kotc-borrowed-disposition'] }],
    ['borrowing a detachment', { borrowedDetachmentId: 'canoptek-court' }],
    ['converting the rules version', { catalogueId: 'necrons~2026' }],
    ['renaming it', { name: 'Practice list' }],
    ['switching to an automatic name', { name: '', automaticName: true }],
    ['nicknaming a unit', { picks: [{ entryId: 'overlord', choices: { weapon: 'staff' }, nickname: 'Szarekh' }] }],
    ['writing a unit note', { picks: [{ entryId: 'overlord', choices: { weapon: 'staff' }, note: 'Hold home.' }] }],
    ['replacing everything from an import', { ...saved, catalogueId: 'aeldari', detachmentIds: [], picks: [] }],
  ])('is refused when %s', (_change, change) => {
    expect(lockedRosterRefusal(locked, { ...saved, ...change })).toBe(LOCKED_ROSTER_MESSAGE)
  })

  it('applies when an older build sends the alerts that moved to the player', () => {
    expect(
      lockedRosterRefusal(locked, {
        ...saved,
        prep: { stratagems: [], secondaries: [], reminders: [{ key: 'r' }], remindersEnabled: true },
      }),
    ).toBeNull()
  })

  it('applies when it leaves the content as it was, such as a visibility change', () => {
    expect(lockedRosterRefusal(locked, { ...saved })).toBeNull()
  })

  it('applies when only the derived automatic name differs', () => {
    expect(
      lockedRosterRefusal(
        { ...locked, name: 'Necrons 1990', automaticName: true },
        { ...saved, name: 'Necrons 1995', automaticName: true },
      ),
    ).toBeNull()
  })

  it('applies unchanged to a row saved with shared unit notes', () => {
    expect(
      lockedRosterRefusal(migrateSavedRoster({ ...locked, prep: { ...(saved.prep as object), shareNotes: true } }) as typeof locked, saved),
    ).toBeNull()
  })

  it('treats absent preparation as the empty defaults', () => {
    expect(lockedRosterRefusal({ ...locked, prep: null }, { ...saved, prep: { stratagems: [], secondaries: [] } })).toBeNull()
  })

  it('ignores key order in stored JSON', () => {
    expect(lockedRosterRefusal(locked, { ...saved, picks: [{ choices: { weapon: 'staff' }, entryId: 'overlord' }] })).toBeNull()
  })
})

describe('a save to an unlocked roster', () => {
  it('applies whatever it changes', () => {
    expect(lockedRosterRefusal({ ...saved, locked: false }, { ...saved, picks: [] })).toBeNull()
  })

  it('applies to a row stored before locking existed', () => {
    expect(lockedRosterRefusal({ ...saved, locked: null }, { ...saved, picks: [] })).toBeNull()
  })

  it('applies to a new roster, such as a duplicate or variant of a locked one', () => {
    expect(lockedRosterRefusal(undefined, { ...saved, picks: [] })).toBeNull()
  })
})

describe('the content of a stored row', () => {
  const row = {
    name: '',
    catalogueId: 'necrons',
    detachmentId: 'awakened-dynasty',
    disposition: null,
    limit: 2_000,
    picks: '[{"entryId":"overlord"}]',
    prep: null,
    waivedRules: '[]',
    optionalRules: null,
    borrowedDetachmentId: null,
  }

  it('reads a legacy single detachment and an unnamed row as automatically named', () => {
    expect(storedRosterContent(migrateStoredRoster(row))).toMatchObject({
      automaticName: true,
      detachmentIds: ['awakened-dynasty'],
      optionalRules: [],
    })
  })

  it('compares equal to the same roster arriving from a client', () => {
    expect(
      lockedRosterRefusal(
        { ...storedRosterContent(migrateStoredRoster(row)), locked: true },
        {
          ...saved,
          name: '',
          automaticName: true,
          disposition: null,
          detachmentIds: ['awakened-dynasty'],
          picks: [{ entryId: 'overlord' }],
        },
      ),
    ).toBeNull()
  })
})

import { expect, it } from 'vitest'
import { migrateSavedRoster } from './retiredRosterFields'
import { migrateStoredRoster } from './savedRosterMigrations'

const row = {
  name: '',
  catalogueId: 'necrons',
  detachmentId: 'awakened-dynasty',
  picks: '[{"entryId":"overlord","nickname":"Leader","note":"Hold home","choices":{"weapon":"staff"}}]',
  prep: '{"stratagems":[],"secondaries":[],"shareNotes":true,"remindersEnabled":false}',
  createdAt: 1n,
  updatedAt: 2n,
}

it('upgrades stored roster fields without changing selections, nicknames, private notes or timestamps', () => {
  expect(migrateStoredRoster(row)).toEqual({
    ...row,
    automaticName: true,
    locked: false,
    detachmentId: '["awakened-dynasty"]',
    printedDefaults: true,
    picks: '[{"entryId":"overlord","nickname":"Leader","note":"Hold home","choices":{"weapon":"staff"},"floor":true}]',
    prep: '{"stratagems":[],"secondaries":[],"remindersEnabled":false}',
  })
})

it('marks every unit of a row saved before a printed default won to keep its cheapest choices', () => {
  expect(JSON.parse(migrateStoredRoster(row).picks)[0].floor).toBe(true)
})

it('leaves the units of a row saved since a printed default won unmarked', () => {
  expect(JSON.parse(migrateStoredRoster({ ...row, printedDefaults: true }).picks)[0].floor).toBeUndefined()
})

it('preserves current metadata and ordered detachments on repeated upgrades', () => {
  const current = { ...row, automaticName: false, locked: true, detachmentId: '["first","second"]' }
  const migrated = migrateStoredRoster(current)
  expect(migrateStoredRoster(migrated)).toEqual({ ...migrated, automaticName: false, locked: true, detachmentId: '["first","second"]' })
})

it('moves a stored roster on a folded rules version, and its allied picks, to the current rules once', () => {
  const folded = {
    ...row,
    catalogueId: 'marine-main~470a-6daa-9014-12df',
    picks: '[{"entryId":"captain","catalogueId":"marine-main~e0af-67df-9d63-8fb7"}]',
  }
  const migrated = migrateStoredRoster(folded)
  expect({ catalogueId: migrated.catalogueId, picks: migrated.picks, again: migrateStoredRoster(migrated) }).toEqual({
    catalogueId: '470a-6daa-9014-12df',
    picks: '[{"entryId":"captain","catalogueId":"e0af-67df-9d63-8fb7","floor":true}]',
    again: migrated,
  })
})

it('stores the rules version a roster was last saved on, so a later timestamp bump cannot move it', () => {
  const stored = { ...row, catalogueId: '470a-6daa-9014-12df', detachmentId: '["3caf-c168-c372-51b1"]', updatedAt: 1n }
  expect(migrateStoredRoster(stored).catalogueId).toBe('legacy-rosters~470a-6daa-9014-12df')
})

it('refuses malformed picks instead of replacing a saved army', () => {
  expect(() => migrateStoredRoster({ ...row, picks: '{' })).toThrow()
})
it.each([
  { field: 'picks', value: 'x'.repeat(1_000_001) },
  { field: 'prep', value: 'x'.repeat(100_001) },
  { field: 'detachmentId', value: 'x'.repeat(1_001) },
])('bounds $field before parsing stored data', ({ field, value }) => {
  expect(() => migrateStoredRoster({ ...row, [field]: value })).toThrow('Saved roster exceeds migration limits')
})

it('removes retired fields from a saved device document without altering its current content', () => {
  expect(migrateSavedRoster({ name: 'List', picks: JSON.parse(row.picks), prep: JSON.parse(row.prep), updatedAt: 2 })).toEqual({
    name: 'List',
    picks: [{ entryId: 'overlord', nickname: 'Leader', note: 'Hold home', choices: { weapon: 'staff' } }],
    prep: { stratagems: [], secondaries: [], remindersEnabled: false },
    updatedAt: 2,
  })
})

it.each([null, undefined, [], 'unrelated'])('keeps absent or unrelated device data %s', (value) => {
  expect(migrateSavedRoster(value)).toBe(value)
})

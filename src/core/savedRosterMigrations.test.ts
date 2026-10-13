import { expect, it } from 'vitest'
import { migrateSavedRoster, migrateStoredRoster } from './savedRosterMigrations'

const row = {
  name: '',
  detachmentId: 'awakened-dynasty',
  picks: '[{"entryId":"overlord","nickname":"Leader","note":"Hold home","choices":{"weapon":"staff"}}]',
  prep: '{"stratagems":[],"secondaries":[],"shareNotes":true,"remindersEnabled":false}',
  createdAt: 1n,
  updatedAt: 2n,
}

it('upgrades stored roster fields without changing selections, private notes or timestamps', () => {
  expect(migrateStoredRoster(row)).toEqual({
    ...row,
    automaticName: true,
    locked: false,
    detachmentId: '["awakened-dynasty"]',
    picks: '[{"entryId":"overlord","note":"Hold home","choices":{"weapon":"staff"}}]',
    prep: '{"stratagems":[],"secondaries":[],"remindersEnabled":false}',
  })
})

it('preserves current metadata and ordered detachments on repeated upgrades', () => {
  const current = { ...row, automaticName: false, locked: true, detachmentId: '["first","second"]' }
  const migrated = migrateStoredRoster(current)
  expect(migrateStoredRoster(migrated)).toEqual({ ...migrated, automaticName: false, locked: true, detachmentId: '["first","second"]' })
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
    picks: [{ entryId: 'overlord', note: 'Hold home', choices: { weapon: 'staff' } }],
    prep: { stratagems: [], secondaries: [], remindersEnabled: false },
    updatedAt: 2,
  })
})

it.each([null, undefined, [], 'unrelated'])('keeps absent or unrelated device data %s', (value) => {
  expect(migrateSavedRoster(value)).toBe(value)
})

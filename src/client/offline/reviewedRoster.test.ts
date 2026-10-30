import { expect, it } from 'vitest'
import { saveRosterSchema } from '../../contracts/schemas'
import { requireReviewedRoster } from './reviewedRoster'

const original = saveRosterSchema.parse({
  id: 'army',
  name: '',
  catalogueId: 'cat',
  detachmentIds: ['one'],
  disposition: null,
  limit: 2000,
  picks: [],
  prep: null,
})

it('compares automatic names with the actual saved draft', () => {
  expect(() => requireReviewedRoster({ ...original, name: 'Generated name', automaticName: true, updatedAt: 4 }, original)).not.toThrow()
})

it.each([null, undefined, {}])('refuses a deleted or malformed baseline %s', (current) => {
  expect(() => requireReviewedRoster(current, original)).toThrow('changed after your review')
})

it('refuses a changed nonempty preparation even when the review used the empty default', () => {
  expect(() =>
    requireReviewedRoster({ ...original, prep: { stratagems: [], secondaries: [{ key: 'card', name: 'Selected card' }] } }, original),
  ).toThrow('changed after your review')
})

it.each([false, true])('compares null and default-empty preparation symmetrically (reverse=%s)', (reverse) => {
  const empty = { ...original, prep: { stratagems: [], secondaries: [], reminders: [], remindersEnabled: true } }
  expect(() => requireReviewedRoster(reverse ? empty : original, reverse ? original : empty)).not.toThrow()
})

it('refuses an explicit disabled-reminders preparation after an enabled-default review', () => {
  expect(() =>
    requireReviewedRoster({ ...original, prep: { stratagems: [], secondaries: [], remindersEnabled: false } }, original),
  ).toThrow('changed after your review')
})

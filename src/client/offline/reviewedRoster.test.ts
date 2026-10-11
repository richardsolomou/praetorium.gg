import { expect, it } from 'vitest'
import { saveRosterSchema } from '../../contracts/schemas'
import { requireReviewedRoster } from './reviewedRoster'
import { SyncEngine } from './syncEngine'
import { emptyLocalState } from '../../contracts/localState'

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

it('refuses deleted or malformed baselines', () => {
  expect(
    [null, undefined, {}].map((current) => {
      try {
        requireReviewedRoster(current, original)
        return false
      } catch {
        return true
      }
    }),
  ).toEqual([true, true, true])
})

it('checks the latest durable roster inside enqueue and leaves a refused candidate unsaved', async () => {
  let state = emptyLocalState('alice')
  state.documents['roster:army'] = { data: original, serverVersion: 1 }
  const engine = new SyncEngine(
    {
      read: async () => state,
      change: async (update) => {
        state = update(state)
        return state
      },
    },
    async () => ({ outcome: 'refused', message: 'Offline' }),
    () => {},
  )
  const save = (limit: number) =>
    engine.enqueue(
      {
        id: String(limit),
        resource: 'roster:army',
        kind: 'saveRoster',
        input: { ...original, limit },
        createdAt: limit,
        status: 'pending',
      },
      undefined,
      (current) => {
        requireReviewedRoster(current, original)
        return { ...original, limit }
      },
    )
  const results = await Promise.allSettled([save(1000), save(3000)])
  expect({
    results: results.map((result) => result.status),
    saved: state.documents['roster:army']?.data,
    operations: state.operations.map((operation) => operation.id),
  }).toEqual({ results: ['fulfilled', 'rejected'], saved: { ...original, limit: 1000 }, operations: ['1000'] })
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

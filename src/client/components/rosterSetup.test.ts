import { expect, it } from 'vitest'
import { detachmentConflict, detachmentRefusal, dispositionsFor, dispositionTone } from './rosterSetup'

it('colors a display name like its disposition id', () => {
  expect(dispositionTone('Take and Hold')).toBe(dispositionTone('take-and-hold'))
})

it('offers the dispositions of every selected detachment once', () => {
  expect(
    dispositionsFor(
      [
        { id: 'one', dispositions: [{ id: 'reconnaissance', name: 'Reconnaissance' }] },
        {
          id: 'two',
          dispositions: [
            { id: 'reconnaissance', name: 'Reconnaissance' },
            { id: 'priority-assets', name: 'Priority Assets' },
          ],
        },
      ],
      ['one', 'two'],
    ),
  ).toEqual([
    { id: 'reconnaissance', name: 'Reconnaissance' },
    { id: 'priority-assets', name: 'Priority Assets' },
  ])
})

const shieldHosts = [
  { id: 'aquilan', name: 'Aquilan Shield', exclusiveWith: [{ id: 'chosen', limit: 'Shield Host' }] },
  { id: 'chosen', name: 'Emperor’s Chosen', exclusiveWith: [{ id: 'aquilan', limit: 'Shield Host' }] },
  { id: 'lions', name: 'Lions of the Emperor', exclusiveWith: [] },
]

it('explains why a detachment sharing a one-per-army limit with a chosen one is unavailable', () => {
  expect(detachmentConflict(shieldHosts[1]!, [shieldHosts[0]!])).toBe(
    "Can't be taken with Aquilan Shield: only one Shield Host detachment",
  )
})

it('offers a detachment that shares no limit with the chosen ones', () => {
  expect(detachmentConflict(shieldHosts[2]!, [shieldHosts[0]!])).toBeNull()
})

const priced = (id: string, points: number) => ({ id, name: id, points })

it('refuses a detachment that costs more DP than the battle size has left', () => {
  expect(detachmentRefusal(priced('two', 2), [priced('one', 2)], 2000)).toEqual({ kind: 'points', reason: 'Needs 2 DP, 1 left' })
})

it('counts no DP left, never fewer, once a smaller battle size leaves the list over budget', () => {
  expect(detachmentRefusal(priced('three', 1), [priced('one', 2), priced('two', 1)], 1000)?.reason).toBe('Needs 1 DP, 0 left')
})

it('offers a detachment over the DP left once the budget is waived', () => {
  expect(detachmentRefusal(priced('two', 2), [priced('one', 2)], 2000, ['detachment-points'])).toBeNull()
})

it('offers a detachment that fits in the DP left', () => {
  expect(detachmentRefusal(priced('two', 1), [priced('one', 2)], 2000)).toBeNull()
})

it('refuses a lone detachment that costs more DP than the battle size allows', () => {
  expect(detachmentRefusal(priced('one', 3), [], 1000)).toEqual({ kind: 'points', reason: 'Needs 3 DP, 2 at this size' })
})

it('refuses a detachment past the most an army can include', () => {
  expect(detachmentRefusal(priced('four', 0), [priced('one', 0), priced('two', 0), priced('three', 0)], 2000)).toEqual({
    kind: 'count',
    reason: 'At most 3 detachments',
  })
})

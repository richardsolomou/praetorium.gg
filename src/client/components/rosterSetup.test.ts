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
  { id: 'aquilan', name: 'Aquilan Shield', exclusiveWith: [{ id: 'chosen', limit: 'Unique: Shield Host' }] },
  { id: 'chosen', name: 'Emperor’s Chosen', exclusiveWith: [{ id: 'aquilan', limit: 'Unique: Shield Host' }] },
  { id: 'lions', name: 'Lions of the Emperor', exclusiveWith: [] },
]

it('explains why a detachment sharing a one-per-army limit with a chosen one is unavailable', () => {
  expect(detachmentConflict(shieldHosts[1]!, [shieldHosts[0]!])).toBe(
    'An army can include only one Unique: Shield Host detachment, and this army already has Aquilan Shield.',
  )
})

it('offers a detachment that shares no limit with the chosen ones', () => {
  expect(detachmentConflict(shieldHosts[2]!, [shieldHosts[0]!])).toBeNull()
})

const priced = (id: string, points: number) => ({ id, name: id, points })

it('refuses a detachment that costs more DP than the battle size has left', () => {
  expect(detachmentRefusal(priced('two', 2), [priced('one', 2)], 2000)).toBe('two costs 2 DP, and only 1 of 3 DP are left.')
})

it('offers a detachment that fits in the DP left', () => {
  expect(detachmentRefusal(priced('two', 1), [priced('one', 2)], 2000)).toBeNull()
})

it('offers any lone detachment whatever it costs', () => {
  expect(detachmentRefusal(priced('one', 5), [], 1000)).toBeNull()
})

it('refuses a detachment past the most an army can include', () => {
  expect(detachmentRefusal(priced('four', 0), [priced('one', 0), priced('two', 0), priced('three', 0)], 2000)).toBe(
    'An army can include at most 3 detachments.',
  )
})

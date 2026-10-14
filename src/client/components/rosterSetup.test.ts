import { expect, it } from 'vitest'
import { detachmentConflict, dispositionsFor, dispositionTone } from './rosterSetup'

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

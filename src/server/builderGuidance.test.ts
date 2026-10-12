import { expect, it } from 'vitest'
import { missionMatchupsFor } from '../core/missionMatchups'
import { calculateRosterPrice } from '../shared/pricing'
import { bookOf } from './catalogue.fixtures'

const loaded = bookOf({
  sharedSelectionEntries: [
    {
      id: 'wrapper',
      name: 'Detachment',
      type: 'upgrade',
      selectionEntryGroups: [
        {
          id: 'choices',
          name: 'Detachment',
          selectionEntries: [
            { id: 'first', name: 'First', type: 'upgrade', categoryLinks: [{ id: 'take-link', name: 'Take and Hold', targetId: 'take' }] },
            {
              id: 'second',
              name: 'Second',
              type: 'upgrade',
              categoryLinks: [{ id: 'purge-link', name: 'Purge the Foe', targetId: 'purge' }],
            },
          ],
        },
      ],
    },
  ],
})
const pair = (you: string, opponent: string) => [
  { id: you, name: you },
  { id: opponent, name: opponent },
]
const pack = {
  id: 'pack',
  name: 'Pack',
  missions: [
    { id: 'hold', name: 'Hold', matchups: [pair('take-and-hold', 'purge-the-foe')] },
    { id: 'kill', name: 'Kill', matchups: [pair('purge-the-foe', 'take-and-hold')] },
  ],
}
const dispositions = [{ id: 'take-and-hold' }, { id: 'purge-the-foe' }]

it.each([
  [null, []],
  ['take-and-hold', ['Hold']],
  ['purge-the-foe', ['Kill']],
] as const)('uses the authoritative resolved disposition %s with multiple purchased detachments', (disposition, expected) => {
  const price = calculateRosterPrice(
    { catalogueId: 'cat', detachmentIds: ['first', 'second'], disposition, limit: 2000, units: [] },
    loaded,
    null,
  )
  expect(
    missionMatchupsFor([pack], price?.disposition ?? '', dispositions).flatMap((entry) => entry.matchups.map((matchup) => matchup.mission)),
  ).toEqual(expected)
})

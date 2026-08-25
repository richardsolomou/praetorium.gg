import { expect, it } from 'vitest'
import { disambiguatedPlayerLabels } from './playerLabels'

it('disambiguates duplicate player names with stable id suffixes', () => {
  expect([
    ...disambiguatedPlayerLabels([
      { id: 'player-one-identifier', name: 'Alex' },
      { id: 'player-two-identifier', name: 'Alex' },
      { id: 'player-three', name: 'Morgan' },
    ]),
  ]).toEqual([
    ['player-one-identifier', 'Alex · player-o'],
    ['player-two-identifier', 'Alex · player-t'],
    ['player-three', 'Morgan'],
  ])
})

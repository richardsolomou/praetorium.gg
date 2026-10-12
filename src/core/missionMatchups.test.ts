import { expect, it } from 'vitest'
import { missionMatchupsFor } from './missionMatchups'

const pair = (you: string, opponent: string) => [
  { id: you, name: you },
  { id: opponent, name: opponent },
]
const dispositions = [{ id: 'take' }, { id: 'purge' }]
const pack = {
  id: 'pack',
  name: 'Pack',
  missions: [
    { id: 'hold', name: 'Hold', matchups: [pair('take', 'purge')] },
    { id: 'kill', name: 'Kill', matchups: [pair('purge', 'take')] },
  ],
}

it('links the current disposition to its own mission in a two-sided matchup', () => {
  expect(missionMatchupsFor([pack], 'take', dispositions)).toEqual([
    { id: 'pack', name: 'Pack', matchups: [{ opponent: 'purge', opponentName: 'purge', mission: 'Hold' }] },
  ])
})
it('changes the mission when the roster chooses another offered disposition', () => {
  expect(missionMatchupsFor([pack], 'purge', dispositions)[0]?.matchups[0]?.mission).toBe('Kill')
})
it('offers no broken matchup when the opponent’s mission is missing', () => {
  expect(missionMatchupsFor([{ ...pack, missions: pack.missions.slice(0, 1) }], 'take', dispositions)).toEqual([])
})
it('offers no matchup for an unresolved or removed disposition', () => {
  expect(missionMatchupsFor([pack], 'other', dispositions)).toEqual([])
})
it('retains mission-pack-qualified destinations', () => {
  expect(missionMatchupsFor([pack, { ...pack, id: 'other' }], 'take', dispositions).map((entry) => entry.id)).toEqual(['pack', 'other'])
})

it('offers no broken link when an opponent disposition has no reference', () => {
  expect(missionMatchupsFor([pack], 'take', [{ id: 'take' }])).toEqual([])
})

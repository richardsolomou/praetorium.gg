import { expect, it } from 'vitest'
import { encodeSimulatorState, type SimulatorState } from './simulatorState'
import { withoutRecentMatchup, withRecentMatchup } from './recentMatchups'

const state = (entryId = 'attacker'): SimulatorState => ({
  v: 1,
  sides: [
    { catalogueId: 'book-a', pick: { entryId }, rules: {} },
    { catalogueId: 'book-b', pick: { entryId: 'defender' }, rules: {} },
  ],
  swapped: false,
})
const entry = (value = state()) => ({ shared: encodeSimulatorState(value), attacker: 'Intercessor Squad', defender: 'Necron Warriors' })

it('keeps the latest settings for a pairing instead of filling history with edits', () => {
  const latest = entry({
    ...state(),
    matchup: { adjustments: { all: { hitModifier: 1 } }, preferences: {}, excluded: { ranged: [], melee: [] }, allocation: [] },
  })
  expect(withRecentMatchup([entry()], latest)).toEqual([latest])
})

it('keeps only six recent pairings, newest first', () => {
  const previous = Array.from({ length: 6 }, (_, index) => entry(state(String(index))))
  expect(withRecentMatchup(previous, entry(state('new')))).toEqual([entry(state('new')), ...previous.slice(0, 5)])
})

it('does not remember an unfinished setup', () => {
  expect(withRecentMatchup([], entry({ ...state(), sides: [state().sides[0], null] }))).toEqual([])
})

it('forgets a pairing whatever settings it was saved with', () => {
  const edited = entry({
    ...state(),
    swapped: false,
    matchup: { adjustments: {}, preferences: {}, excluded: { ranged: [], melee: [] }, allocation: [] },
  })
  expect(withoutRecentMatchup([edited, entry(state('other'))], entry().shared)).toEqual([entry(state('other'))])
})

it('replaces a pairing when a unit gains an attached leader', () => {
  const led = state()
  led.sides[0] = { ...led.sides[0]!, attached: [{ entryId: 'leader' }] }
  expect(withRecentMatchup([entry()], entry(led))).toEqual([entry(led)])
})

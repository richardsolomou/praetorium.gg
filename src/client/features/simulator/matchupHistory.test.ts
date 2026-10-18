import { expect, it } from 'vitest'
import { encodeSimulatorState, type SimulatorState } from '../../../contracts/simulatorState'
import { exampleMatchup, parseMatchupHistory, withRecentMatchup } from './matchupHistory'

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

it.each([
  null,
  '{',
  '[]'.repeat(40_001),
  JSON.stringify([entry({ ...state(), v: 2 } as unknown as SimulatorState)]),
  JSON.stringify([{ ...entry(), attacker: 'x'.repeat(201) }]),
])('ignores damaged or unbounded stored matchups', (raw) => {
  expect(parseMatchupHistory(raw)).toEqual([])
})

it('restores only valid entries without unknown stored fields', () => {
  expect(parseMatchupHistory(JSON.stringify([{ ...entry(), privateRoster: 'discard' }, { shared: 'invalid' }]))).toEqual([entry()])
})

const index = [
  {
    name: 'Space Marines',
    catalogueId: 'marines',
    units: [{ id: 'intercessors', slug: 'intercessors', name: 'Intercessor Squad', points: 80 }],
  },
  { name: 'Necrons', catalogueId: 'necrons', units: [{ id: 'warriors', slug: 'warriors', name: 'Necron Warriors', points: 90 }] },
]

it('resolves the editable example against the current catalogue rather than stored IDs', () => {
  expect(exampleMatchup(index)?.sides.map((side) => [side?.catalogueId, side?.pick.entryId])).toEqual([
    ['marines', 'intercessors'],
    ['necrons', 'warriors'],
  ])
})

it('offers no example when either exact unit is unavailable', () => {
  expect(exampleMatchup(index.slice(0, 1))).toBeNull()
})

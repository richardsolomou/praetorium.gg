import { describe, expect, it } from 'vitest'
import { decodeSimulatorState, encodeSimulatorState, type SimulatorState } from './simulatorState'

const state: SimulatorState = {
  v: 1,
  sides: [
    { catalogueId: 'necrons', pick: { entryId: 'immortals', models: 10, spreads: { gun: { tesla: 10 } } }, rules: { command: 2 } },
    { catalogueId: 'necrons', pick: { entryId: 'tomb-blades' }, rules: {} },
  ],
  swapped: true,
  matchup: {
    adjustments: { ranged: { cover: true }, weapons: { all: { skill: 1 } }, target: { save: -1 } },
    preferences: { 'Gauss blaster': 'Gauss blaster – sustained' },
    excluded: { ranged: ['Tesla carbine'], melee: [] },
    allocation: ['Tomb Blade – shieldvanes'],
  },
}
const encoded = (value: unknown) => encodeSimulatorState(value as SimulatorState)

describe('simulator links', () => {
  it('restores the matchup they were made from', () => {
    expect(decodeSimulatorState(encodeSimulatorState(state))).toEqual(state)
  })
  it('stay safe to put in a URL', () => {
    expect(encodeSimulatorState(state)).toMatch(/^[\w-]+$/)
  })
  it('keep names outside ASCII intact', () => {
    const named: SimulatorState = { ...state, matchup: { ...state.matchup!, allocation: ['Ætherwing – ★'] } }
    expect(decodeSimulatorState(encodeSimulatorState(named))?.matchup?.allocation).toEqual(['Ætherwing – ★'])
  })
  it('open an empty simulator when the text is not a link', () => {
    expect(decodeSimulatorState('not a link!')).toBeNull()
  })
  it('open an empty simulator when the matchup does not validate', () => {
    expect(decodeSimulatorState(encoded({ ...state, swapped: 'yes' }))).toBeNull()
  })
  it('open an empty simulator for a link from another version', () => {
    expect(decodeSimulatorState(encoded({ ...state, v: 2 }))).toBeNull()
  })
  it('refuse links longer than any real matchup', () => {
    expect(decodeSimulatorState('a'.repeat(8_001))).toBeNull()
  })
})

it('restores leader and support loadouts alongside the main squad', () => {
  const attached: SimulatorState = {
    ...state,
    sides: [
      { ...state.sides[0]!, attached: [{ entryId: 'overlord', choices: { weapon: 'voidscythe' } }, { entryId: 'plasmancer' }] },
      state.sides[1],
    ],
  }
  expect(decodeSimulatorState(encodeSimulatorState(attached))).toEqual(attached)
})

it('bounds the number of units in a shared side', () => {
  expect(
    decodeSimulatorState(
      encoded({ ...state, sides: [{ ...state.sides[0], attached: Array.from({ length: 8 }, () => ({ entryId: 'leader' })) }, null] }),
    ),
  ).toBeNull()
})

it('retains both sides’ weapon profiles while the optimized side defends', () => {
  const withProfiles: SimulatorState = {
    ...state,
    sides: [
      { ...state.sides[0]!, preferences: { 'melee:0:staff': 'sweep' } },
      { ...state.sides[1]!, preferences: { 'ranged:0:gun': 'focused' } },
    ],
  }
  expect(decodeSimulatorState(encodeSimulatorState(withProfiles))?.sides).toEqual(withProfiles.sides)
})

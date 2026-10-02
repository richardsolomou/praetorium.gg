import { describe, expect, it } from 'vitest'
import { decodeSimulatorState, encodeSimulatorState, type SimulatorState } from './simulatorUrl'

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

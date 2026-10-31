import { describe, expect, it } from 'vitest'
import {
  datasheetMatchup,
  decodeSimulatorState,
  encodeSimulatorState,
  rosterMatchup,
  simulatorPairing,
  type SimulatorState,
} from './simulatorState'

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
    const long: SimulatorState = { ...state, matchup: { ...state.matchup!, allocation: Array.from({ length: 20 }, () => '★'.repeat(200)) } }
    expect(decodeSimulatorState(encodeSimulatorState(long))).toBeNull()
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

describe('a unit joined to an attached unit', () => {
  const chained = (attachedTo: number) =>
    encoded({ ...state, sides: [{ ...state.sides[0], attached: [{ entryId: 'command-squad' }, { entryId: 'nork', attachedTo }] }, null] })

  it('restores the attached unit it joined', () => {
    expect(decodeSimulatorState(chained(1))?.sides[0]?.attached?.[1]).toEqual({ entryId: 'nork', attachedTo: 1 })
  })

  it.each([2, 3])('refuses joining position %i, which is not an earlier unit', (attachedTo) => {
    expect(decodeSimulatorState(chained(attachedTo))).toBeNull()
  })
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

describe('a datasheet opened in the simulator', () => {
  const unit = { catalogueId: 'necrons', pick: { entryId: 'immortals', catalogueId: 'necrons' }, rules: {} }

  it('attacks with the unit and leaves the defender to choose', () => {
    expect(decodeSimulatorState(datasheetMatchup('necrons', 'immortals', 'attacker'))?.sides).toEqual([unit, null])
  })

  it('defends with the unit and leaves the attacker to choose', () => {
    expect(decodeSimulatorState(datasheetMatchup('necrons', 'immortals', 'defender'))?.sides).toEqual([null, unit])
  })
})

describe('saved roster sides', () => {
  const fromRoster: SimulatorState = {
    ...state,
    sides: [{ ...state.sides[0]!, roster: { id: 'roster-1', pickIndex: 3 } }, state.sides[1]],
  }
  it('restore the roster and unit they name', () => {
    expect(decodeSimulatorState(encodeSimulatorState(fromRoster))?.sides[0]?.roster).toEqual({ id: 'roster-1', pickIndex: 3 })
  })
  it('pair apart from the same unit picked without a roster', () => {
    expect(simulatorPairing(encodeSimulatorState(fromRoster))).not.toBe(simulatorPairing(encodeSimulatorState(state)))
  })
  it('pair apart from the same unit in another roster', () => {
    const other: SimulatorState = {
      ...fromRoster,
      sides: [{ ...fromRoster.sides[0]!, roster: { id: 'roster-2', pickIndex: 3 } }, state.sides[1]],
    }
    expect(simulatorPairing(encodeSimulatorState(fromRoster))).not.toBe(simulatorPairing(encodeSimulatorState(other)))
  })
  it('pair with the same roster unit whichever position it moved to', () => {
    const moved: SimulatorState = {
      ...fromRoster,
      sides: [{ ...fromRoster.sides[0]!, roster: { id: 'roster-1', pickIndex: 0 } }, state.sides[1]],
    }
    expect(simulatorPairing(encodeSimulatorState(fromRoster))).toBe(simulatorPairing(encodeSimulatorState(moved)))
  })
})

describe('sealed list roster sides', () => {
  const sealedEvent = { token: 'sealed-event-1', eventToken: 'event-1', userId: 'friend-1' }
  const fromSealedEvent: SimulatorState = {
    ...state,
    sides: [{ ...state.sides[0]!, roster: { league: sealedEvent, pickIndex: 2 } }, state.sides[1]],
  }
  it('restore the sealed list and unit they name', () => {
    expect(decodeSimulatorState(encodeSimulatorState(fromSealedEvent))?.sides[0]?.roster).toEqual({ league: sealedEvent, pickIndex: 2 })
  })
  it('pair apart from the same entrant in another event', () => {
    const other: SimulatorState = {
      ...fromSealedEvent,
      sides: [
        { ...fromSealedEvent.sides[0]!, roster: { league: { ...sealedEvent, eventToken: 'event-2' }, pickIndex: 2 } },
        state.sides[1],
      ],
    }
    expect(simulatorPairing(encodeSimulatorState(fromSealedEvent))).not.toBe(simulatorPairing(encodeSimulatorState(other)))
  })
})

it('defends with a unit from another player’s roster and leaves the attacker to choose', () => {
  const pick = { entryId: 'warriors', models: 20 }
  expect(decodeSimulatorState(rosterMatchup('necrons', pick, { id: 'roster-1' }, 4))?.sides).toEqual([
    null,
    { catalogueId: 'necrons', pick, rules: {}, roster: { id: 'roster-1', pickIndex: 4 } },
  ])
})

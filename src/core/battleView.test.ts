import { describe, expect, it } from 'vitest'
import { type Command, reduceBattle, validate } from './battle'
import { battleReport } from './battleReport'
import { battleView } from './battleView'
import { ALICE, BOB, NAMES, PLAYERS, builtRoster, log, roster, started, text, turns } from './battle.fixtures'

describe('the view', () => {
  it('shows a practice opponent’s deck and seat to the table playing it', () => {
    const cards = [
      { key: 'a', name: 'Area Denial' },
      { key: 'b', name: 'Bring It Down' },
    ]
    const state = reduceBattle(
      PLAYERS,
      log(...started(), [
        ALICE,
        {
          kind: 'set-prep',
          playerId: BOB,
          stratagems: [],
          secondaries: [],
          secondaryDeck: cards,
          primary: null,
          secondaryMode: 'tactical',
        },
      ]),
    )
    const seats = [
      { id: ALICE, name: 'Alice' },
      { id: BOB, name: 'Practice Opponent', automated: true },
    ]

    const view = battleView({ token: 'abc' }, seats, state, ALICE)
    expect(view.players[1]).toMatchObject({ automated: true, secondaryDeckReady: true, remainingSecondaries: cards })
    // A seat someone does sign in to keeps its deck to itself.
    expect(battleView({ token: 'abc' }, NAMES, state, ALICE).players[1]).toMatchObject({
      secondaryDeckReady: true,
      remainingSecondaries: [],
    })
  })

  it('offers the latest undo to both players', () => {
    const state = reduceBattle(PLAYERS, log(...started(), [ALICE, { kind: 'score', category: 'primary', delta: 5 }]))
    expect(battleView({ token: 'abc' }, NAMES, state, BOB)).toMatchObject({ undoable: state.undoable?.seq, undoableDraw: false })
  })

  it('marks an undo that returns a randomly drawn mission to its deck', () => {
    const state = reduceBattle(
      PLAYERS,
      log(...started(), [ALICE, { kind: 'draw-secondary', secondary: { key: 'assassination', name: 'Assassination' } }]),
    )
    expect(battleView({ token: 'abc' }, NAMES, state, BOB)).toMatchObject({ undoable: state.undoable?.seq, undoableDraw: true })
  })

  it('marks a grouped refill as a destructive draw undo', () => {
    const state = reduceBattle(
      PLAYERS,
      log(...started(), [
        ALICE,
        {
          kind: 'draw-secondaries',
          secondaries: [
            { key: 'beacon', name: 'Establish Locus' },
            { key: 'assassination', name: 'Assassination' },
          ],
        },
      ]),
    )
    expect(battleView({ token: 'abc' }, NAMES, state, BOB)).toMatchObject({ undoable: state.undoable?.seq, undoableDraw: true })
  })

  it('totals a player’s victory points', () => {
    const state = reduceBattle(
      PLAYERS,
      log(
        ...started(),
        [ALICE, { kind: 'score', category: 'primary', delta: 5 }],
        [ALICE, { kind: 'score', category: 'secondary', delta: 3 }],
      ),
    )
    expect(battleView({ token: 'abc' }, NAMES, state, ALICE).players.find((player) => player.isViewer)?.total).toBe(8)
  })

  it('attributes scores to the round they were made', () => {
    const state = reduceBattle(
      PLAYERS,
      log(...started(), [ALICE, { kind: 'score', category: 'primary', delta: 5 }], ...turns(6, ALICE), ...turns(6, BOB), [
        ALICE,
        { kind: 'score', category: 'primary', delta: 3 },
      ]),
    )
    expect(battleView({ token: 'abc' }, NAMES, state, ALICE).players[0]?.rounds.slice(0, 2)).toMatchObject([
      { primary: 5, total: 5 },
      { primary: 3, total: 3 },
    ])
  })
})

describe('units on the table', () => {
  const withUnits = (): [string, Command][] => [
    [ALICE, builtRoster('Ultramarines', ['Intercessors', 'Captain'])],
    [BOB, roster('Death Guard')],
    [ALICE, { kind: 'begin-battle', firstPlayerId: ALICE }],
  ]

  it('start out standing', () => {
    const state = reduceBattle(PLAYERS, log(...withUnits()))
    expect(state.players.find((player) => player.id === ALICE)?.units.every((unit) => !unit.destroyed)).toBe(true)
  })

  it('can be lost', () => {
    const state = reduceBattle(PLAYERS, log(...withUnits(), [ALICE, { kind: 'set-unit', unitKey: 'u0', destroyed: true }]))
    expect(state.players.find((player) => player.id === ALICE)?.units.find((unit) => unit.key === 'u0')?.destroyed).toBe(true)
  })

  it('are counted in the view', () => {
    const state = reduceBattle(PLAYERS, log(...withUnits(), [ALICE, { kind: 'set-unit', unitKey: 'u0', destroyed: true }]))
    expect(battleView({ token: 'abc' }, NAMES, state, ALICE).players.find((player) => player.isViewer)?.standing).toBe(1)
  })

  it('require another participant to name the army they are changing', () => {
    const state = reduceBattle(PLAYERS, log(...withUnits()))
    expect(validate(state, BOB, { kind: 'set-unit', unitKey: 'u0', destroyed: true })).toBe('that is not one of your units')
  })

  it('can be changed by another participant on the owner’s behalf', () => {
    const command: Command = { kind: 'set-unit', unitKey: 'u0', destroyed: true, playerId: ALICE }
    const state = reduceBattle(PLAYERS, log(...withUnits(), [BOB, command]))

    expect(validate(reduceBattle(PLAYERS, log(...withUnits())), BOB, command)).toBeNull()
    expect(state.players.find((player) => player.id === ALICE)?.units[0]?.destroyed).toBe(true)
  })

  it('are replaced wholesale when a list is', () => {
    // A different army is a different set of units, so nothing about the old one
    // may survive into it.
    const history = log(
      [ALICE, builtRoster('Ultramarines', ['Intercessors', 'Captain'])],
      [ALICE, builtRoster('Salamanders', ['Aggressors'])],
    )
    expect(reduceBattle(PLAYERS, history).players.find((player) => player.id === ALICE)?.units).toHaveLength(1)
  })

  it('are absent for a pasted list, which names nothing', () => {
    const state = reduceBattle(PLAYERS, log([ALICE, roster('Ultramarines')]))
    expect(state.players.find((player) => player.id === ALICE)?.units).toEqual([])
  })

  it('travel once in the view: on the player, never repeated under the roster', () => {
    const state = reduceBattle(PLAYERS, log(...withUnits()))
    const seen = battleView({ token: 'abc' }, NAMES, state, ALICE).players.find((player) => player.isViewer)
    expect({
      repeated: seen?.roster?.built && 'units' in seen.roster.built,
      units: seen?.units.map((unit) => unit.name),
    }).toEqual({ repeated: false, units: ['Intercessors', 'Captain'] })
  })
})

describe('models within a unit', () => {
  const inPlay = (): [string, Command][] => [
    [ALICE, builtRoster('Ultramarines', ['Intercessors'])],
    [BOB, roster('Death Guard')],
    [ALICE, { kind: 'begin-battle', firstPlayerId: ALICE }],
  ]

  const intercessors = (state: ReturnType<typeof reduceBattle>) =>
    state.players.find((player) => player.id === ALICE)?.units.find((unit) => unit.key === 'u0')

  it('start out whole', () => {
    expect(intercessors(reduceBattle(PLAYERS, log(...inPlay())))?.alive).toBe(5)
  })

  it('come off one at a time', () => {
    const state = reduceBattle(PLAYERS, log(...inPlay(), [ALICE, { kind: 'wound-unit', unitKey: 'u0', delta: -2 }]))
    expect(intercessors(state)?.alive).toBe(3)
  })

  it('cannot go below none', () => {
    const state = reduceBattle(PLAYERS, log(...inPlay()))
    expect(validate(state, ALICE, { kind: 'wound-unit', unitKey: 'u0', delta: -6 })).toBe('there are not that many models left')
  })

  it('cannot exceed what the unit was fielded with', () => {
    const state = reduceBattle(PLAYERS, log(...inPlay()))
    expect(validate(state, ALICE, { kind: 'wound-unit', unitKey: 'u0', delta: 1 })).toBe('that is more models than the unit has')
  })

  it('destroy the unit when the last one goes', () => {
    // Losing the last model and losing the unit are one event, not two states.
    const state = reduceBattle(PLAYERS, log(...inPlay(), [ALICE, { kind: 'wound-unit', unitKey: 'u0', delta: -5 }]))
    expect(intercessors(state)?.destroyed).toBe(true)
  })

  it('are emptied when the unit is marked lost outright', () => {
    const state = reduceBattle(PLAYERS, log(...inPlay(), [ALICE, { kind: 'set-unit', unitKey: 'u0', destroyed: true }]))
    expect(intercessors(state)?.alive).toBe(0)
  })

  it('come back whole when the unit is brought back', () => {
    const history = log(
      ...inPlay(),
      [ALICE, { kind: 'set-unit', unitKey: 'u0', destroyed: true }],
      [ALICE, { kind: 'set-unit', unitKey: 'u0', destroyed: false }],
    )
    expect(intercessors(reduceBattle(PLAYERS, history))?.alive).toBe(5)
  })

  it('read as a loss in the account when the last model goes', () => {
    const history = log(...inPlay(), [ALICE, { kind: 'wound-unit', unitKey: 'u0', delta: -5 }])
    expect(text(battleReport(NAMES, history))).toContain('Alice loses Intercessors')
  })

  it('name the recorder and owner when another player removes the last model', () => {
    const history = log(...inPlay(), [BOB, { kind: 'wound-unit', unitKey: 'u0', delta: -5, playerId: ALICE }])

    expect(text(battleReport(NAMES, history))).toContain('Bob removes the last model from Alice’s Intercessors')
  })

  it('read as models in the account otherwise', () => {
    const history = log(...inPlay(), [ALICE, { kind: 'wound-unit', unitKey: 'u0', delta: -1 }])
    expect(text(battleReport(NAMES, history))).toContain('Alice loses 1 model from Intercessors')
  })
})

describe('wounds within a unit', () => {
  /** A squad whose models each take three wounds, so a model dies part-way through a volley. */
  const squad = (): [string, Command][] => [
    [ALICE, builtRoster('Ultramarines', ['Terminators'], { models: 5, wounds: 3 })],
    [BOB, roster('Death Guard')],
    [ALICE, { kind: 'begin-battle', firstPlayerId: ALICE }],
  ]

  /** One model with twelve wounds, which is the case models alone could say nothing about. */
  const walker = (): [string, Command][] => [
    [ALICE, builtRoster('Ultramarines', ['Redemptor Dreadnought'], { models: 1, wounds: 12 })],
    [BOB, roster('Death Guard')],
    [ALICE, { kind: 'begin-battle', firstPlayerId: ALICE }],
  ]

  const unit = (state: ReturnType<typeof reduceBattle>) =>
    state.players.find((player) => player.id === ALICE)?.units.find((entry) => entry.key === 'u0')

  it('start out unharmed', () => {
    expect(unit(reduceBattle(PLAYERS, log(...walker())))?.damage).toBe(0)
  })

  it('come off the one model taking them', () => {
    const state = reduceBattle(PLAYERS, log(...walker(), [ALICE, { kind: 'damage-unit', unitKey: 'u0', delta: -5 }]))
    expect(unit(state)?.damage).toBe(5)
  })

  it('leave a single model standing until its last wound goes', () => {
    const state = reduceBattle(PLAYERS, log(...walker(), [ALICE, { kind: 'damage-unit', unitKey: 'u0', delta: -11 }]))
    expect(unit(state)?.alive).toBe(1)
  })

  it('destroy the unit as the last wound goes', () => {
    const state = reduceBattle(PLAYERS, log(...walker(), [ALICE, { kind: 'damage-unit', unitKey: 'u0', delta: -12 }]))
    expect(unit(state)?.destroyed).toBe(true)
  })

  it('take a model off the squad once they run past one model’s worth', () => {
    const state = reduceBattle(PLAYERS, log(...squad(), [ALICE, { kind: 'damage-unit', unitKey: 'u0', delta: -4 }]))
    expect(unit(state)?.alive).toBe(4)
  })

  it('carry the remainder onto the next model rather than rounding it away', () => {
    const state = reduceBattle(PLAYERS, log(...squad(), [ALICE, { kind: 'damage-unit', unitKey: 'u0', delta: -4 }]))
    expect(unit(state)?.damage).toBe(1)
  })

  it('give the model back when the wounds are', () => {
    const history = log(
      ...squad(),
      [ALICE, { kind: 'damage-unit', unitKey: 'u0', delta: -4 }],
      [ALICE, { kind: 'damage-unit', unitKey: 'u0', delta: 4 }],
    )
    expect(unit(reduceBattle(PLAYERS, history))).toMatchObject({ alive: 5, damage: 0 })
  })

  it('cannot go below none', () => {
    const state = reduceBattle(PLAYERS, log(...walker()))
    expect(validate(state, ALICE, { kind: 'damage-unit', unitKey: 'u0', delta: -13 })).toBe('there are not that many wounds left')
  })

  it('cannot exceed what the unit was fielded with', () => {
    const state = reduceBattle(PLAYERS, log(...walker()))
    expect(validate(state, ALICE, { kind: 'damage-unit', unitKey: 'u0', delta: 1 })).toBe('that is more wounds than the unit has')
  })

  it('are refused for a unit whose datasheet gives no single wounds characteristic', () => {
    const unspecified: [string, Command][] = [
      [ALICE, builtRoster('Ultramarines', ['Wolf Guard Terminators'])],
      [BOB, roster('Death Guard')],
      [ALICE, { kind: 'begin-battle', firstPlayerId: ALICE }],
    ]
    const state = reduceBattle(PLAYERS, log(...unspecified))
    expect(validate(state, ALICE, { kind: 'damage-unit', unitKey: 'u0', delta: -1 })).toBe(
      'the datasheet does not give this unit a single wounds characteristic',
    )
  })

  it('are cleared when a whole model is taken off instead', () => {
    // The model carrying the damage is the one that just left the table.
    const history = log(
      ...squad(),
      [ALICE, { kind: 'damage-unit', unitKey: 'u0', delta: -1 }],
      [ALICE, { kind: 'wound-unit', unitKey: 'u0', delta: -1 }],
    )
    expect(unit(reduceBattle(PLAYERS, history))).toMatchObject({ alive: 4, damage: 0 })
  })

  it('are cleared when the unit is brought back', () => {
    const history = log(
      ...squad(),
      [ALICE, { kind: 'damage-unit', unitKey: 'u0', delta: -1 }],
      [ALICE, { kind: 'set-unit', unitKey: 'u0', destroyed: true }],
      [ALICE, { kind: 'set-unit', unitKey: 'u0', destroyed: false }],
    )
    expect(unit(reduceBattle(PLAYERS, history))).toMatchObject({ alive: 5, damage: 0 })
  })

  it('read as wounds in the account', () => {
    const history = log(...walker(), [ALICE, { kind: 'damage-unit', unitKey: 'u0', delta: -5 }])
    expect(text(battleReport(NAMES, history))).toContain('Alice takes 5 wounds on Redemptor Dreadnought')
  })

  it('name the recorder and owner when another player deals them', () => {
    const history = log(...walker(), [BOB, { kind: 'damage-unit', unitKey: 'u0', delta: -5, playerId: ALICE }])
    expect(text(battleReport(NAMES, history))).toContain('Bob puts 5 wounds on Alice\u2019s Redemptor Dreadnought')
  })

  it('read as a loss in the account when the last wound goes', () => {
    const history = log(...walker(), [ALICE, { kind: 'damage-unit', unitKey: 'u0', delta: -12 }])
    expect(text(battleReport(NAMES, history))).toContain('Alice loses Redemptor Dreadnought')
  })
})

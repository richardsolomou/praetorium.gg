import { describe, expect, it } from 'vitest'
import { BATTLE_ROUNDS, battleReport, battleView, type Command, type LoggedCommand, reduceBattle, validate } from './battle'

const ALICE = 'alice'
const BOB = 'bob'
const PLAYERS = [ALICE, BOB]
const NAMES = [
  { id: ALICE, name: 'Alice' },
  { id: BOB, name: 'Bob' },
]

/** Builds a log the way the repository does: sequential seqs, nothing skipped. */
function log(...entries: [PlayerId: string, command: Command][]): LoggedCommand[] {
  return entries.map(([by, command], index) => ({ seq: index + 1, by, at: index, command }))
}

const roster = (name: string): Command => ({ kind: 'attach-roster', roster: { name, text: '10 Intercessors' } })

/** A list built from the catalogue, whose units the battle can then track. */
const builtRoster = (name: string, units: string[]): Command => ({
  kind: 'attach-roster',
  roster: {
    name,
    text: units.join('\n'),
    built: {
      catalogueId: 'cat',
      revision: 'rev',
      limit: 2000,
      detachment: 'Flyblown Host',
      disposition: 'reconnaissance',
      selections: [],
      units: units.map((unit, index) => ({ key: `u${index}`, name: unit, points: 100, models: 5 })),
    },
  },
})
const advance = (): Command => ({ kind: 'advance' })

/** Both lists in, Alice going first. */
const started = (): [string, Command][] => [
  [ALICE, roster('Ultramarines')],
  [BOB, roster('Death Guard')],
  [ALICE, { kind: 'begin-battle', firstPlayerId: ALICE }],
]

const turns = (count: number, by: string): [string, Command][] => Array.from({ length: count }, () => [by, advance()])

describe('setup', () => {
  it('has no active player before the battle begins', () => {
    expect(reduceBattle(PLAYERS, log()).activePlayerId).toBeNull()
  })

  it('refuses to begin until both armies have a list', () => {
    const state = reduceBattle(PLAYERS, log([ALICE, roster('Ultramarines')]))
    expect(validate(state, ALICE, { kind: 'begin-battle', firstPlayerId: ALICE })).toBe('both armies need a list')
  })

  it('refuses a list once the battle has begun', () => {
    const state = reduceBattle(PLAYERS, log(...started()))
    expect(validate(state, BOB, roster('Death Guard'))).toBe('the battle has started')
  })
})

describe('the turn sequence', () => {
  it('grants the first player a command point as the battle opens', () => {
    const state = reduceBattle(PLAYERS, log(...started()))
    expect(state.players.find((player) => player.id === ALICE)?.cp).toBe(1)
  })

  it('steps through the phases in order', () => {
    const state = reduceBattle(PLAYERS, log(...started(), ...turns(2, ALICE)))
    expect(state.phase).toBe('shooting')
  })

  it('passes the turn to the opponent after the end phase', () => {
    const state = reduceBattle(PLAYERS, log(...started(), ...turns(6, ALICE)))
    expect(state.activePlayerId).toBe(BOB)
  })

  it('starts the incoming player on their command phase', () => {
    const state = reduceBattle(PLAYERS, log(...started(), ...turns(6, ALICE)))
    expect(state.phase).toBe('command')
  })

  it('holds the round number until both players have played', () => {
    const state = reduceBattle(PLAYERS, log(...started(), ...turns(6, ALICE)))
    expect(state.round).toBe(1)
  })

  it('advances the round once the second player finishes', () => {
    const state = reduceBattle(PLAYERS, log(...started(), ...turns(6, ALICE), ...turns(6, BOB)))
    expect(state.round).toBe(2)
  })

  it('returns the first turn of a new round to whoever went first', () => {
    const state = reduceBattle(PLAYERS, log(...started(), ...turns(6, ALICE), ...turns(6, BOB)))
    expect(state.activePlayerId).toBe(ALICE)
  })

  it('finishes the battle after the last round', () => {
    const rounds = Array.from({ length: BATTLE_ROUNDS }, () => [...turns(6, ALICE), ...turns(6, BOB)]).flat()
    const state = reduceBattle(PLAYERS, log(...started(), ...rounds))
    expect(state.status).toBe('finished')
  })

  it('refuses to end a phase for the player whose turn it is not', () => {
    const state = reduceBattle(PLAYERS, log(...started()))
    expect(validate(state, BOB, advance())).toBe('it is not your turn')
  })
})

describe('command points', () => {
  it('cannot be spent below zero', () => {
    const state = reduceBattle(PLAYERS, log(...started()))
    expect(validate(state, ALICE, { kind: 'adjust-cp', delta: -2 })).toBe('not enough command points')
  })

  it('are spent from the spender, not the active player', () => {
    const state = reduceBattle(PLAYERS, log(...started(), [ALICE, { kind: 'adjust-cp', delta: -1 }]))
    expect(state.players.find((player) => player.id === ALICE)?.cp).toBe(0)
  })
})

describe('undo', () => {
  it('takes back the newest command', () => {
    const history = log(...started(), [ALICE, { kind: 'score', category: 'primary', delta: 5 }])
    const undo = reduceBattle(PLAYERS, [
      ...history,
      { seq: history.length + 1, by: ALICE, at: 9, command: { kind: 'undo', target: history.length } },
    ])
    expect(undo.players.find((player) => player.id === ALICE)?.primary).toBe(0)
  })

  it('is refused for anything older than the newest command', () => {
    const state = reduceBattle(PLAYERS, log(...started(), [ALICE, { kind: 'score', category: 'primary', delta: 5 }]))
    expect(validate(state, ALICE, { kind: 'undo', target: 1 })).toBe('only the last action can be undone')
  })

  it('is refused to the player who did not issue the command', () => {
    const state = reduceBattle(PLAYERS, log(...started(), [ALICE, { kind: 'score', category: 'primary', delta: 5 }]))
    expect(validate(state, BOB, { kind: 'undo', target: state.undoable?.seq ?? 0 })).toBe('that was your opponent’s action')
  })

  it('still counts towards the concurrency token, so a stale client is caught', () => {
    const history = log(...started(), [ALICE, { kind: 'score', category: 'primary', delta: 5 }])
    const undo = reduceBattle(PLAYERS, [
      ...history,
      { seq: history.length + 1, by: ALICE, at: 9, command: { kind: 'undo', target: history.length } },
    ])
    expect(undo.seq).toBe(history.length + 1)
  })
})

describe('the view', () => {
  it('offers undo only to the player who acted', () => {
    const state = reduceBattle(PLAYERS, log(...started(), [ALICE, { kind: 'score', category: 'primary', delta: 5 }]))
    expect(battleView({ token: 'abc' }, NAMES, state, BOB).undoable).toBeNull()
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

  it('belong to their own player', () => {
    const state = reduceBattle(PLAYERS, log(...withUnits()))
    expect(validate(state, BOB, { kind: 'set-unit', unitKey: 'u0', destroyed: true })).toBe('that is not one of your units')
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
})

describe('stratagems', () => {
  const STRAT = { key: 's1', name: 'Grenade', cp: 1, limit: 'turn' as const }

  const armed = (): [string, Command][] => [
    ...started(),
    [ALICE, { kind: 'set-prep', stratagems: [STRAT], secondaries: [], primary: null, secondaryMode: 'fixed' }],
    [ALICE, { kind: 'adjust-cp', delta: 3 }],
  ]

  const alice = (state: ReturnType<typeof reduceBattle>) => state.players.find((player) => player.id === ALICE)

  it('cost command points when used', () => {
    const state = reduceBattle(PLAYERS, log(...armed(), [ALICE, { kind: 'use-stratagem', key: 's1' }]))
    expect(alice(state)?.cp).toBe(3)
  })

  it('cannot be used twice in the same turn when that is the limit', () => {
    const state = reduceBattle(PLAYERS, log(...armed(), [ALICE, { kind: 'use-stratagem', key: 's1' }]))
    expect(validate(state, ALICE, { kind: 'use-stratagem', key: 's1' })).toBe('Grenade has been used this turn')
  })

  it('come back round in the next turn', () => {
    const history = log(...armed(), [ALICE, { kind: 'use-stratagem', key: 's1' }], ...turns(6, ALICE))
    expect(validate(reduceBattle(PLAYERS, history), BOB, { kind: 'use-stratagem', key: 's1' })).toBe('that is not one of your stratagems')
  })

  it('are refused without the command points to pay for them', () => {
    const state = reduceBattle(
      PLAYERS,
      log(...started(), [
        ALICE,
        { kind: 'set-prep', stratagems: [{ ...STRAT, cp: 4 }], secondaries: [], primary: null, secondaryMode: 'fixed' },
      ]),
    )
    expect(validate(state, ALICE, { kind: 'use-stratagem', key: 's1' })).toBe('not enough command points')
  })

  it('belong to the player who wrote them down', () => {
    const state = reduceBattle(PLAYERS, log(...armed()))
    expect(validate(state, BOB, { kind: 'use-stratagem', key: 's1' })).toBe('that is not one of your stratagems')
  })

  it('are offered to the interface with the reason they cannot be used', () => {
    const state = reduceBattle(PLAYERS, log(...armed(), [ALICE, { kind: 'use-stratagem', key: 's1' }]))
    const view = battleView({ token: 'abc' }, NAMES, state, ALICE)
    expect(view.players.find((player) => player.isViewer)?.stratagems[0]?.refusal).toBe('Grenade has been used this turn')
  })
})

describe('secondaries', () => {
  const named = (): [string, Command][] => [
    ...started(),
    [
      ALICE,
      {
        kind: 'set-prep',
        stratagems: [],
        primary: null,
        secondaryMode: 'fixed',
        secondaries: [
          { key: 'a', name: 'Behind Enemy Lines' },
          { key: 'b', name: 'Bring It Down' },
        ],
      },
    ],
  ]

  const alice = (state: ReturnType<typeof reduceBattle>) => state.players.find((player) => player.id === ALICE)

  it('are scored one at a time', () => {
    const state = reduceBattle(PLAYERS, log(...named(), [ALICE, { kind: 'score-secondary', key: 'a', delta: 4 }]))
    expect(alice(state)?.scored.a).toBe(4)
  })

  it('add up to the secondary total', () => {
    const history = log(
      ...named(),
      [ALICE, { kind: 'score-secondary', key: 'a', delta: 4 }],
      [ALICE, { kind: 'score-secondary', key: 'b', delta: 3 }],
    )
    expect(alice(reduceBattle(PLAYERS, history))?.secondary).toBe(7)
  })

  it('carry achieved and discarded lifecycle state into the view', () => {
    const state = reduceBattle(PLAYERS, log(...named(), [ALICE, { kind: 'set-secondary-status', key: 'a', status: 'achieved' }]))
    expect(battleView({ token: 'abc' }, NAMES, state, ALICE).players[0]?.secondaries[0]?.status).toBe('achieved')
  })

  it('draw replacements only for tactical missions', () => {
    const tactical: [string, Command] = [
      ALICE,
      {
        kind: 'set-prep',
        stratagems: [],
        primary: null,
        secondaryMode: 'tactical',
        secondaries: [{ key: 'a', name: 'Behind Enemy Lines' }],
      },
    ]
    const state = reduceBattle(
      PLAYERS,
      log(...started(), tactical, [ALICE, { kind: 'draw-secondary', secondary: { key: 'b', name: 'Bring It Down' } }]),
    )
    expect(alice(state)?.secondaries.map((secondary) => secondary.name)).toEqual(['Behind Enemy Lines', 'Bring It Down'])
  })

  it('take over from the undifferentiated pile once named', () => {
    // Two ways of adding to one total is how a breakdown stops adding up.
    const state = reduceBattle(PLAYERS, log(...named()))
    expect(validate(state, ALICE, { kind: 'score', category: 'secondary', delta: 3 })).toBe('score the secondary by name')
  })

  it('stop contributing when they are taken off the list', () => {
    const history = log(
      ...named(),
      [ALICE, { kind: 'score-secondary', key: 'a', delta: 4 }],
      [
        ALICE,
        { kind: 'set-prep', stratagems: [], secondaries: [{ key: 'b', name: 'Bring It Down' }], primary: null, secondaryMode: 'fixed' },
      ],
    )
    expect(alice(reduceBattle(PLAYERS, history))?.secondary).toBe(0)
  })

  it('are refused a score they do not have', () => {
    const state = reduceBattle(PLAYERS, log(...named()))
    expect(validate(state, ALICE, { kind: 'score-secondary', key: 'a', delta: -1 })).toBe('that would go below zero')
  })
})

describe('deployment', () => {
  const withUnits = (): [string, Command][] => [
    [ALICE, builtRoster('Ultramarines', ['Intercessors', 'Captain'])],
    [BOB, roster('Death Guard')],
  ]

  const alice = (state: ReturnType<typeof reduceBattle>) => state.players.find((player) => player.id === ALICE)

  it('starts every unit off the table', () => {
    const state = reduceBattle(PLAYERS, log(...withUnits()))
    expect(alice(state)?.units.every((unit) => !unit.deployed)).toBe(true)
  })

  it('puts a unit on the table when its owner says so', () => {
    const state = reduceBattle(PLAYERS, log(...withUnits(), [ALICE, { kind: 'deploy-unit', unitKey: 'u0', deployed: true }]))
    expect(battleView({ token: 'abc' }, NAMES, state, ALICE).players.find((player) => player.isViewer)?.deployed).toBe(1)
  })

  it('leaves a unit its owner did not deploy in reserve', () => {
    const state = reduceBattle(PLAYERS, log(...withUnits(), [ALICE, { kind: 'deploy-unit', unitKey: 'u0', deployed: true }]))
    expect(alice(state)?.units.find((unit) => unit.key === 'u1')?.deployed).toBe(false)
  })

  it('belongs to the player whose unit it is', () => {
    const state = reduceBattle(PLAYERS, log(...withUnits()))
    expect(validate(state, BOB, { kind: 'deploy-unit', unitKey: 'u0', deployed: true })).toBe('that is not one of your units')
  })

  it('shares the battlefield: either player may set it', () => {
    const state = reduceBattle(PLAYERS, log(...withUnits(), [BOB, { kind: 'set-deployment', patternId: 'tipping-point' }]))
    expect(state.deploymentId).toBe('tipping-point')
  })

  it('refuses to move the zones once the battle has started', () => {
    const state = reduceBattle(PLAYERS, log(...started()))
    expect(validate(state, ALICE, { kind: 'set-deployment', patternId: 'tipping-point' })).toBe('the battle has started')
  })

  it('counts a destroyed unit as no longer on the table', () => {
    const history = log(
      ...withUnits(),
      [ALICE, { kind: 'deploy-unit', unitKey: 'u0', deployed: true }],
      [ALICE, { kind: 'begin-battle', firstPlayerId: ALICE }],
      [ALICE, { kind: 'set-unit', unitKey: 'u0', destroyed: true }],
    )
    expect(battleView({ token: 'abc' }, NAMES, reduceBattle(PLAYERS, history), ALICE).players[0]?.deployed).toBe(0)
  })
})

const text = (entries: ReturnType<typeof battleReport>) => entries.map((entry) => entry.text)

describe('the account of the battle', () => {
  it('says who brought what', () => {
    expect(text(battleReport(NAMES, log(...started())))[0]).toBe('Alice brought Ultramarines')
  })

  it('names the detachment when the list does not', () => {
    const history = log([ALICE, builtRoster('Ultramarines', ['Intercessors'])])
    expect(text(battleReport(NAMES, history))[0]).toBe('Alice brought Ultramarines (Flyblown Host)')
  })

  it('marks the turn passing over', () => {
    const history = log(...started(), ...turns(6, ALICE))
    expect(text(battleReport(NAMES, history))).toContain('The turn passes to Bob')
  })

  it('marks a new round', () => {
    const history = log(...started(), ...turns(6, ALICE), ...turns(6, BOB))
    expect(text(battleReport(NAMES, history))).toContain('Round 2 begins')
  })

  it('reports a stratagem by name and cost', () => {
    const history = log(
      ...started(),
      [
        ALICE,
        {
          kind: 'set-prep',
          stratagems: [{ key: 's1', name: 'Grenade', cp: 1, limit: 'turn' }],
          secondaries: [],
          primary: null,
          secondaryMode: 'fixed',
        },
      ],
      [ALICE, { kind: 'adjust-cp', delta: 2 }],
      [ALICE, { kind: 'use-stratagem', key: 's1' }],
    )
    expect(text(battleReport(NAMES, history))).toContain('Alice uses Grenade for 1 CP')
  })

  it('leaves out what was undone, because it did not happen', () => {
    const history = log(...started(), [ALICE, { kind: 'score', category: 'primary', delta: 5 }])
    const withUndo = [...history, { seq: history.length + 1, by: ALICE, at: 9, command: { kind: 'undo' as const, target: history.length } }]
    expect(text(battleReport(NAMES, withUndo))).not.toContain('Alice scores 5 primary')
  })

  it('records the round a thing happened in', () => {
    const history = log(...started(), ...turns(6, ALICE), ...turns(6, BOB), [BOB, { kind: 'score', category: 'primary', delta: 3 }])
    expect(battleReport(NAMES, history).at(-1)).toMatchObject({ round: 2, text: 'Bob scores 3 primary' })
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

  it('read as models in the account otherwise', () => {
    const history = log(...inPlay(), [ALICE, { kind: 'wound-unit', unitKey: 'u0', delta: -1 }])
    expect(text(battleReport(NAMES, history))).toContain('Alice loses 1 model from Intercessors')
  })
})

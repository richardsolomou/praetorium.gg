import { describe, expect, it } from 'vitest'
import { BATTLE_ROUNDS, battleView, type Command, type LoggedCommand, reduceBattle, validate } from './battle'

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

import { describe, expect, it } from 'vitest'
import {
  BATTLE_ROUNDS,
  battleReport,
  battleView,
  type Command,
  detachmentLimit,
  formatDatasheetLimit,
  type LoggedCommand,
  reduceBattle,
  validate,
} from './battle'

const ALICE = 'alice'
const BOB = 'bob'
const CAROL = 'carol'
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
  it('shares the current setup section with every player', () => {
    const state = reduceBattle(PLAYERS, log([BOB, { kind: 'set-setup-step', step: 2 }]))

    expect(battleView({ token: 'shared-step' }, NAMES, state, ALICE).setupStep).toBe(2)
  })

  it('lets allies share one turn in a 2v1 battle', () => {
    const configure: Command = {
      kind: 'configure-battle',
      limit: 2000,
      missionPackId: null,
      terrainLayoutId: null,
      twistId: null,
      solo: false,
      teamBattle: true,
      clockLimitMinutes: null,
    }
    const state = reduceBattle(
      [ALICE, BOB, CAROL],
      log(
        [ALICE, configure],
        [ALICE, roster('Knights')],
        [BOB, roster('Marines')],
        [CAROL, roster('Guard')],
        [ALICE, { kind: 'begin-battle', firstPlayerId: BOB }],
      ),
      [0, 1, 1],
    )

    expect(validate(state, CAROL, advance())).toBeNull()
  })

  it('shares allied command points while keeping their rosters separate', () => {
    const configure: Command = {
      kind: 'configure-battle',
      limit: 2000,
      missionPackId: null,
      terrainLayoutId: null,
      twistId: null,
      solo: false,
      teamBattle: true,
      clockLimitMinutes: null,
    }
    const state = reduceBattle(
      [ALICE, BOB, CAROL],
      log(
        [ALICE, configure],
        [ALICE, roster('Knights')],
        [BOB, roster('Marines')],
        [CAROL, roster('Guard')],
        [ALICE, { kind: 'begin-battle', firstPlayerId: BOB }],
        [CAROL, { kind: 'adjust-cp', delta: 2 }],
      ),
      [0, 1, 1],
    )
    const view = battleView({ token: 'team' }, [...NAMES, { id: CAROL, name: 'Carol' }], state, CAROL)

    expect(view.players.map((player) => ({ name: player.roster?.name, cp: player.cp }))).toEqual([
      { name: 'Knights', cp: 0 },
      { name: 'Marines', cp: 3 },
      { name: 'Guard', cp: 3 },
    ])
  })

  it('limits King of the Colosseum to one detachment', () => {
    expect(detachmentLimit(500)).toBe(1)
    expect(detachmentLimit(600)).toBe(1)
    expect(detachmentLimit(2000)).toBe(3)
  })

  it('applies King of the Colosseum datasheet caps', () => {
    expect(formatDatasheetLimit(500, false)).toBe(1)
    expect(formatDatasheetLimit(500, true)).toBe(2)
    expect(formatDatasheetLimit(600, false)).toBe(1)
    expect(formatDatasheetLimit(600, true)).toBe(2)
    expect(formatDatasheetLimit(2000, false)).toBeNull()
  })

  it('has no active player before the battle begins', () => {
    expect(reduceBattle(PLAYERS, log()).activePlayerId).toBeNull()
  })

  it('refuses to begin until both armies have a list', () => {
    const state = reduceBattle(PLAYERS, log([ALICE, roster('Ultramarines')]))
    expect(validate(state, ALICE, { kind: 'begin-battle', firstPlayerId: ALICE })).toBe('both armies need a list')
  })

  it('allows correcting a list once the battle has begun', () => {
    const state = reduceBattle(PLAYERS, log(...started()))
    expect(validate(state, BOB, roster('Death Guard'))).toBeNull()
  })

  it('refuses a change of cards once the battle has begun', () => {
    const state = reduceBattle(PLAYERS, log(...started()))
    const prep: Command = { kind: 'set-prep', stratagems: [], secondaries: [], primary: null, secondaryMode: 'fixed' }
    expect(validate(state, ALICE, prep)).toBe('cards are settled before the battle begins')
  })

  it('refuses cards carried in with a replacement list', () => {
    const state = reduceBattle(PLAYERS, log(...started()))
    const command: Command = {
      kind: 'attach-roster',
      roster: { name: 'Death Guard', text: '10 Plague Marines' },
      prep: { stratagems: [], secondaries: [], primary: null, secondaryMode: 'fixed' },
    }
    expect(validate(state, BOB, command)).toBe('cards are settled before the battle begins')
  })

  it('keeps legacy logs with a non-default roster size startable', () => {
    const alice = builtRoster('Incursion army', ['Intercessors'])
    if (alice.kind !== 'attach-roster' || !alice.roster.built) throw new Error('expected a built roster')
    alice.roster.built.limit = 1000
    const state = reduceBattle(PLAYERS, log([ALICE, alice], [BOB, roster('Death Guard')]))
    expect(validate(state, ALICE, { kind: 'begin-battle', firstPlayerId: ALICE })).toBeNull()
  })

  it('requires attached rosters to match an explicitly configured size', () => {
    const state = reduceBattle(
      PLAYERS,
      log(
        [
          ALICE,
          {
            kind: 'configure-battle',
            limit: 1000,
            missionPackId: null,
            terrainLayoutId: null,
            twistId: null,
            solo: false,
            clockLimitMinutes: null,
          },
        ],
        [ALICE, builtRoster('Strike force', ['Intercessors'])],
        [BOB, roster('Death Guard')],
      ),
    )
    expect(validate(state, ALICE, { kind: 'begin-battle', firstPlayerId: ALICE })).toBe('every roster must match the battle size')
  })

  it('refuses a replacement roster at the wrong configured size', () => {
    const state = reduceBattle(
      PLAYERS,
      log(
        [
          ALICE,
          {
            kind: 'configure-battle',
            limit: 1000,
            missionPackId: null,
            terrainLayoutId: null,
            twistId: null,
            solo: false,
            clockLimitMinutes: null,
          },
        ],
        [ALICE, roster('Incursion army')],
        [BOB, roster('Death Guard')],
        [ALICE, { kind: 'begin-battle', firstPlayerId: ALICE }],
      ),
    )
    expect(validate(state, ALICE, builtRoster('Strike force', ['Intercessors']))).toBe('that roster does not match the battle size')
  })

  it('refuses multiple detachments over the battle-size allowance', () => {
    const command = builtRoster('Necrons', ['Immortals'])
    if (command.kind !== 'attach-roster' || !command.roster.built) throw new Error('expected a built roster')
    command.roster.built.detachments = [
      { name: 'Cryptek Conclave', points: 2 },
      { name: 'Hand of the Dynasty', points: 1 },
    ]
    command.roster.built.detachmentPointBudget = 2

    expect(validate(reduceBattle(PLAYERS, log()), ALICE, command)).toBe('invalid detachment combination')
  })

  it('allows one detachment above the multi-detachment allowance', () => {
    const command = builtRoster('Necrons', ['Immortals'])
    if (command.kind !== 'attach-roster' || !command.roster.built) throw new Error('expected a built roster')
    command.roster.built.detachments = [{ name: 'Hand of the Dynasty', points: 3 }]
    command.roster.built.detachmentPointBudget = 2

    expect(validate(reduceBattle(PLAYERS, log()), ALICE, command)).toBeNull()
  })

  it('validates tactical prep attached with a roster', () => {
    const command: Command = {
      kind: 'attach-roster',
      roster: { name: 'Necrons', text: '10 Immortals' },
      prep: { stratagems: [], secondaries: [], primary: null, secondaryMode: 'tactical' },
    }

    expect(validate(reduceBattle(PLAYERS, log()), ALICE, command)).toBe('choose a tactical secondary deck')
  })

  it('refuses duplicate cards in prep attached with a roster', () => {
    const card = { key: 'a', name: 'Behind Enemy Lines' }
    const command: Command = {
      kind: 'attach-roster',
      roster: { name: 'Necrons', text: '10 Immortals' },
      prep: { stratagems: [], secondaries: [card], secondaryDeck: [card, card], primary: null, secondaryMode: 'tactical' },
    }

    expect(validate(reduceBattle(PLAYERS, log()), ALICE, command)).toBe('the secondary deck contains duplicates')
  })

  it('refuses selected cards outside prep attached with a roster', () => {
    const command: Command = {
      kind: 'attach-roster',
      roster: { name: 'Necrons', text: '10 Immortals' },
      prep: {
        stratagems: [],
        secondaries: [{ key: 'b', name: 'Bring It Down' }],
        secondaryDeck: [{ key: 'a', name: 'Behind Enemy Lines' }],
        primary: null,
        secondaryMode: 'tactical',
      },
    }

    expect(validate(reduceBattle(PLAYERS, log()), ALICE, command)).toBe('a selected secondary is not in the deck')
  })

  it('supports a private solo practice battle without a second identity', () => {
    const history = log(
      [
        ALICE,
        {
          kind: 'configure-battle',
          limit: 2000,
          missionPackId: null,
          terrainLayoutId: null,
          twistId: null,
          solo: true,
          clockLimitMinutes: null,
        },
      ],
      [ALICE, roster('Practice army')],
      [ALICE, { kind: 'begin-battle', firstPlayerId: ALICE, attackerId: ALICE }],
    )

    expect(reduceBattle([ALICE], history)).toMatchObject({ status: 'playing', activePlayerId: ALICE, round: 1 })
  })

  it('resets a setup draft without deleting its history', () => {
    const state = reduceBattle(
      PLAYERS,
      log(
        [ALICE, roster('Ultramarines')],
        [ALICE, { kind: 'set-deployment', patternId: 'sweeping-engagement' }],
        [ALICE, { kind: 'reset-setup' }],
      ),
    )

    expect(state.players.every((player) => player.roster === null)).toBe(true)
    expect(state.deploymentId).toBeNull()
  })

  it('keeps the configured format when setup is reset', () => {
    const state = reduceBattle(
      PLAYERS,
      log(
        [
          ALICE,
          {
            kind: 'configure-battle',
            limit: 1000,
            missionPackId: 'chapter-approved',
            terrainLayoutId: 'layout-a',
            twistId: 'twist-a',
            solo: false,
            clockLimitMinutes: 45,
          },
        ],
        [ALICE, { kind: 'reset-setup' }],
      ),
    )

    expect(state.settings).toEqual({
      limit: 1000,
      missionPackId: 'chapter-approved',
      terrainLayoutId: null,
      twistId: null,
      solo: false,
      teamBattle: false,
    })
  })

  it('clears deployment and terrain when a setup roster changes', () => {
    const state = reduceBattle(
      PLAYERS,
      log(
        [ALICE, { kind: 'set-deployment', patternId: 'tipping-point' }],
        [
          ALICE,
          {
            kind: 'configure-battle',
            limit: 2000,
            missionPackId: null,
            terrainLayoutId: 'layout-a',
            twistId: null,
            solo: false,
            clockLimitMinutes: null,
          },
        ],
        [ALICE, roster('Ultramarines')],
      ),
    )

    expect(state).toMatchObject({ deploymentId: null, settings: { terrainLayoutId: null } })
  })

  it('reconciles saved prep when a roster is replaced', () => {
    const replacement = roster('Corrected roster')
    if (replacement.kind !== 'attach-roster') throw new Error('expected an attached roster')
    replacement.prep = {
      stratagems: [{ key: 'new', name: 'New Order', cp: 1, limit: 'turn' }],
      secondaries: [{ key: 'new-card', name: 'New Card' }],
      primary: null,
      secondaryMode: 'fixed',
    }
    const state = reduceBattle(
      PLAYERS,
      log(
        ...started(),
        [
          ALICE,
          {
            kind: 'set-prep',
            stratagems: [{ key: 'old', name: 'Old Order', cp: 1, limit: 'turn' }],
            secondaries: [{ key: 'old-card', name: 'Old Card' }],
            primary: null,
            secondaryMode: 'fixed',
          },
        ],
        [ALICE, replacement],
      ),
    )

    expect(state.players[0]).toMatchObject({ stratagems: [{ key: 'new' }], secondaries: [{ key: 'new-card' }] })
  })

  it('keeps prep when replaying a legacy roster replacement without prep data', () => {
    const state = reduceBattle(
      PLAYERS,
      log(
        ...started(),
        [
          ALICE,
          {
            kind: 'set-prep',
            stratagems: [{ key: 'old', name: 'Old Order', cp: 1, limit: 'turn' }],
            secondaries: [{ key: 'old-card', name: 'Old Card' }],
            primary: null,
            secondaryMode: 'fixed',
          },
        ],
        [ALICE, roster('Legacy corrected roster')],
      ),
    )

    expect(state.players[0]).toMatchObject({ stratagems: [{ key: 'old' }], secondaries: [{ key: 'old-card' }] })
  })

  it('allows replacing your roster after play starts', () => {
    const state = reduceBattle(PLAYERS, log(...started()))
    expect(validate(state, ALICE, roster('Corrected roster'))).toBeNull()
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

  it('derives completed turn duration from command timestamps', () => {
    const history = log(...started(), ...turns(6, ALICE))
    history.forEach((entry) => (entry.at *= 60_000))

    expect(battleView({ token: 'abc' }, NAMES, reduceBattle(PLAYERS, history), ALICE).turns[0]).toMatchObject({
      playerName: 'Alice',
      round: 1,
      minutes: 6,
    })
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

  it.each([500, 600])('finishes %i-point King of the Colosseum after three rounds', (limit) => {
    const configured: [string, Command] = [
      ALICE,
      {
        kind: 'configure-battle',
        limit,
        missionPackId: null,
        terrainLayoutId: null,
        twistId: null,
        solo: false,
        clockLimitMinutes: null,
      },
    ]
    const rounds = Array.from({ length: 3 }, () => [...turns(6, ALICE), ...turns(6, BOB)]).flat()
    const state = reduceBattle(PLAYERS, log(configured, ...started(), ...rounds))
    const view = battleView({ token: 'abc' }, NAMES, state, ALICE)

    expect(state).toMatchObject({ status: 'finished', round: 3, result: { reason: 'completed' } })
    expect(view.rounds).toBe(3)
    expect(view.players[0]?.rounds).toHaveLength(3)
  })

  it('keeps the final battle round within the five-round ledger', () => {
    const rounds = Array.from({ length: BATTLE_ROUNDS }, () => [...turns(6, ALICE), ...turns(6, BOB)]).flat()
    const state = reduceBattle(PLAYERS, log(...started(), ...rounds))
    expect(state.round).toBe(BATTLE_ROUNDS)
  })

  it('records each solo round as its own turn', () => {
    const state = reduceBattle(
      [ALICE],
      log(
        [
          ALICE,
          {
            kind: 'configure-battle',
            limit: 2000,
            missionPackId: null,
            terrainLayoutId: null,
            twistId: null,
            solo: true,
            clockLimitMinutes: null,
          },
        ],
        [ALICE, roster('Practice army')],
        [ALICE, { kind: 'begin-battle', firstPlayerId: ALICE }],
        ...turns(6, ALICE),
      ),
    )

    expect(state.turns.map((turn) => turn.round)).toEqual([1, 2])
  })

  it('naturally completes all five solo rounds', () => {
    const state = reduceBattle(
      [ALICE],
      log(
        [
          ALICE,
          {
            kind: 'configure-battle',
            limit: 2000,
            missionPackId: null,
            terrainLayoutId: null,
            twistId: null,
            solo: true,
            clockLimitMinutes: null,
          },
        ],
        [ALICE, roster('Practice army')],
        [ALICE, { kind: 'begin-battle', firstPlayerId: ALICE }],
        ...turns(BATTLE_ROUNDS * 6, ALICE),
      ),
    )

    expect(state).toMatchObject({ status: 'finished', result: { reason: 'completed', concededBy: null } })
    expect(state.turns.map((turn) => turn.round)).toEqual([1, 2, 3, 4, 5])
  })

  it('requires an opponent to name the active player when ending their phase', () => {
    const state = reduceBattle(PLAYERS, log(...started()))
    expect(validate(state, BOB, advance())).toBe('it is not your turn')
  })

  it('lets an opponent end the active player’s phase for them', () => {
    const history = log(...started(), [BOB, { kind: 'advance', playerId: ALICE }])

    expect(validate(reduceBattle(PLAYERS, log(...started())), BOB, { kind: 'advance', playerId: ALICE })).toBeNull()
    expect(reduceBattle(PLAYERS, history).phase).toBe('movement')
  })

  it('waits for the active side to draw its private tactical hand', () => {
    const history = log(
      [ALICE, roster('Ultramarines')],
      [BOB, roster('Death Guard')],
      [
        ALICE,
        {
          kind: 'set-prep',
          stratagems: [],
          secondaries: [],
          secondaryDeck: [{ key: 'a', name: 'Area Denial' }],
          primary: null,
          secondaryMode: 'tactical',
        },
      ],
      [ALICE, { kind: 'begin-battle', firstPlayerId: ALICE }],
    )

    expect(validate(reduceBattle(PLAYERS, history), BOB, { kind: 'advance', playerId: ALICE })).toBe(
      'the active side has an action to settle',
    )
  })

  it('waits for the active side captain to settle the previous turn before a helper advances', () => {
    const history = log(...started(), ...turns(6, ALICE))
    const pending = reduceBattle(PLAYERS, history)

    expect(validate(pending, ALICE, { kind: 'advance', playerId: BOB })).toBe('the active side has an action to settle')
    expect(validate(pending, BOB, { kind: 'settle-opponent-turn' })).toBeNull()

    const settled = reduceBattle(PLAYERS, log(...started(), ...turns(6, ALICE), [BOB, { kind: 'settle-opponent-turn' }]))
    expect(validate(settled, ALICE, { kind: 'advance', playerId: BOB })).toBeNull()
  })

  it('shows pending opponent-turn scoring only to the side captain', () => {
    const state = reduceBattle(PLAYERS, log(...started(), ...turns(6, ALICE)))

    expect(battleView({ token: 'abc' }, NAMES, state, BOB).settlementRound).toBe(1)
    expect(battleView({ token: 'abc' }, NAMES, state, ALICE).settlementRound).toBeNull()
  })

  it('treats an existing owner advance as settling the previous turn', () => {
    const state = reduceBattle(PLAYERS, log(...started(), ...turns(6, ALICE), [BOB, advance()]))

    expect(state.phase).toBe('movement')
    expect(battleView({ token: 'abc' }, NAMES, state, BOB).settlementRound).toBeNull()
  })

  it('does not let an ally settle the side captain’s previous turn', () => {
    const configure: Command = {
      kind: 'configure-battle',
      limit: 2000,
      missionPackId: null,
      terrainLayoutId: null,
      twistId: null,
      solo: false,
      teamBattle: true,
      clockLimitMinutes: null,
    }
    const state = reduceBattle(
      [ALICE, BOB, CAROL],
      log(
        [ALICE, configure],
        [ALICE, roster('Knights')],
        [BOB, roster('Marines')],
        [CAROL, roster('Guard')],
        [ALICE, { kind: 'begin-battle', firstPlayerId: ALICE }],
        ...turns(6, ALICE),
      ),
      [0, 1, 1],
    )

    expect(validate(state, CAROL, { kind: 'settle-opponent-turn' })).toBe('only the side captain can settle the previous turn')
  })

  it('keeps settlement bookkeeping out of the report and undo target', () => {
    const history = log(...started(), ...turns(6, ALICE), [BOB, { kind: 'settle-opponent-turn' }])
    const state = reduceBattle(PLAYERS, history)

    expect(battleView({ token: 'abc' }, NAMES, state, BOB).undoable).toBe(history.at(-2)?.seq)
    expect(battleReport(NAMES, history).some((entry) => entry.commandKind === 'settle-opponent-turn')).toBe(false)
  })

  it('waits for the side captain when an ally cannot see the private tactical deck', () => {
    const configure: Command = {
      kind: 'configure-battle',
      limit: 2000,
      missionPackId: null,
      terrainLayoutId: null,
      twistId: null,
      solo: false,
      teamBattle: true,
      clockLimitMinutes: null,
    }
    const history = log(
      [ALICE, configure],
      [ALICE, roster('Knights')],
      [BOB, roster('Marines')],
      [CAROL, roster('Guard')],
      [
        BOB,
        {
          kind: 'set-prep',
          stratagems: [],
          secondaries: [],
          secondaryDeck: [{ key: 'a', name: 'Area Denial' }],
          primary: null,
          secondaryMode: 'tactical',
        },
      ],
      [ALICE, { kind: 'begin-battle', firstPlayerId: BOB }],
    )

    expect(validate(reduceBattle([ALICE, BOB, CAROL], history, [0, 1, 1]), CAROL, { kind: 'advance', playerId: BOB })).toBe(
      'the active side has an action to settle',
    )
  })

  it('waits for the active side to settle its hidden mission before passing the turn', () => {
    const history = log(
      ...started(),
      [ALICE, { kind: 'select-secret', secondary: { key: 'secret-a', name: 'Hold the Line' } }],
      ...turns(5, ALICE),
    )

    expect(validate(reduceBattle(PLAYERS, history), BOB, { kind: 'advance', playerId: ALICE })).toBe(
      'the active side has an action to settle',
    )
  })

  it('preserves target-less team advances already stored in the log', () => {
    const configure: Command = {
      kind: 'configure-battle',
      limit: 2000,
      missionPackId: null,
      terrainLayoutId: null,
      twistId: null,
      solo: false,
      teamBattle: true,
      clockLimitMinutes: null,
    }
    const history = log(
      [ALICE, configure],
      [ALICE, roster('Knights')],
      [BOB, roster('Marines')],
      [CAROL, roster('Guard')],
      [ALICE, { kind: 'begin-battle', firstPlayerId: ALICE }],
      ...turns(6, BOB),
    )
    const state = reduceBattle([ALICE, BOB, CAROL], history, [0, 0, 1])

    expect({ round: state.round, active: state.activePlayerId }).toEqual({ round: 2, active: ALICE })
  })

  it('refuses to advance for a player outside the battle', () => {
    const state = reduceBattle(PLAYERS, log(...started()))
    expect(validate(state, BOB, { kind: 'advance', playerId: 'mallory' })).toBe('that player is not in this battle')
  })
})

describe('command points', () => {
  it('refuses score corrections before play begins', () => {
    const state = reduceBattle(PLAYERS, log())
    expect(validate(state, ALICE, { kind: 'correct-player', playerId: ALICE, resource: 'primary', delta: 1 })).toBe(
      'the battle has not started',
    )
  })
  it('cannot be spent below zero', () => {
    const state = reduceBattle(PLAYERS, log(...started()))
    expect(validate(state, ALICE, { kind: 'adjust-cp', delta: -2 })).toBe('not enough command points')
  })

  it('are spent from the spender, not the active player', () => {
    const state = reduceBattle(PLAYERS, log(...started(), [ALICE, { kind: 'adjust-cp', delta: -1 }]))
    expect(state.players.find((player) => player.id === ALICE)?.cp).toBe(0)
  })

  it('can be changed by another participant on the player’s behalf', () => {
    const command: Command = { kind: 'adjust-cp', delta: 2, playerId: ALICE }
    const state = reduceBattle(PLAYERS, log(...started(), [BOB, command]))

    expect(validate(reduceBattle(PLAYERS, log(...started())), BOB, command)).toBeNull()
    expect(state.players.find((player) => player.id === ALICE)?.cp).toBe(3)
    expect(state.players.find((player) => player.id === BOB)?.cp).toBe(0)
  })

  it('report gained, used and remaining separately', () => {
    const state = reduceBattle(PLAYERS, log(...started(), [ALICE, { kind: 'adjust-cp', delta: -1 }]))
    const player = battleView({ token: 'abc' }, NAMES, state, ALICE).players[0]
    expect(player).toMatchObject({ cpGained: 1, cpSpent: 1, cp: 0 })
  })

  it('lets either participant correct either score after completion', () => {
    const state = reduceBattle(PLAYERS, log(...started(), [ALICE, { kind: 'end-battle', reason: 'finished-early' }]))
    expect(validate(state, BOB, { kind: 'correct-player', playerId: ALICE, resource: 'primary', delta: 5 })).toBeNull()
  })
})

describe('battle management', () => {
  it('requires a conceding player for a concession', () => {
    const state = reduceBattle(PLAYERS, log(...started()))
    expect(validate(state, ALICE, { kind: 'end-battle', reason: 'conceded' })).toBe('choose who conceded')
  })

  it('refuses a conceding player on another result', () => {
    const state = reduceBattle(PLAYERS, log(...started()))
    expect(validate(state, ALICE, { kind: 'end-battle', reason: 'finished-early', concededBy: ALICE })).toBe(
      'only a concession names a conceding player',
    )
  })

  it('records natural completion only from the final turn', () => {
    const state = reduceBattle(PLAYERS, log(...started()))
    expect(validate(state, ALICE, { kind: 'end-battle', reason: 'completed' })).toBe('completed battles finish after the last turn')
  })
  it('records concessions and who conceded', () => {
    const state = reduceBattle(PLAYERS, log(...started(), [BOB, { kind: 'end-battle', reason: 'conceded', concededBy: BOB }]))
    expect(state).toMatchObject({ status: 'finished', result: { reason: 'conceded', concededBy: BOB } })
  })

  it('only allows a player to concede for themselves', () => {
    const state = reduceBattle(PLAYERS, log(...started()))
    expect(validate(state, ALICE, { kind: 'end-battle', reason: 'conceded', concededBy: BOB })).toBe('you can only concede for yourself')
  })

  it('can reopen a finished battle without discarding its score', () => {
    const history = log(
      ...started(),
      [ALICE, { kind: 'score', category: 'primary', delta: 5 }],
      [ALICE, { kind: 'end-battle', reason: 'finished-early' }],
      [BOB, { kind: 'reopen-battle' }],
    )
    const state = reduceBattle(PLAYERS, history)
    expect(state.status).toBe('playing')
    expect(state.players[0]?.primary).toBe(5)
  })

  it('holds the painted-army bonus back while the battle is running', () => {
    const state = reduceBattle(PLAYERS, log([ALICE, { kind: 'set-painted', painted: true }], ...started()))
    expect(battleView({ token: 'abc' }, NAMES, state, ALICE).players[0]).toMatchObject({ painted: true, paintedPoints: 10, total: 0 })
  })

  it('adds the painted-army bonus to the total once the battle is over', () => {
    const state = reduceBattle(
      PLAYERS,
      log([ALICE, { kind: 'set-painted', painted: true }], ...started(), [ALICE, { kind: 'end-battle', reason: 'finished-early' }]),
    )
    expect(battleView({ token: 'abc' }, NAMES, state, ALICE).players[0]).toMatchObject({ paintedPoints: 10, total: 10 })
  })

  it('refuses a battle ready bonus once the battle has started', () => {
    const state = reduceBattle(PLAYERS, log(...started()))
    expect(validate(state, ALICE, { kind: 'set-painted', painted: true })).toBe('the battle ready bonus is set before the battle begins')
  })

  it('cannot take back the moment the battle began', () => {
    const state = reduceBattle(PLAYERS, log(...started()))
    expect(state.undoable).toBeNull()
  })

  it('names whose army a battle ready bonus was recorded for', () => {
    const history = log([BOB, roster('Death Guard')], [ALICE, { kind: 'set-painted', painted: true, playerId: BOB }])
    expect(text(battleReport(NAMES, history))).toContain('Alice marks Bob’s army battle ready')
  })

  it('says the army is your own when you record your own bonus', () => {
    const history = log([ALICE, roster('Ultramarines')], [ALICE, { kind: 'set-painted', painted: true, playerId: ALICE }])
    expect(text(battleReport(NAMES, history))).toContain('Alice marks their army battle ready')
  })

  it('lets one device arrange an ally’s reserves while the table is being set', () => {
    const state = reduceBattle(
      PLAYERS,
      log(
        [BOB, builtRoster('Death Guard', ['Plague Marines'])],
        [ALICE, { kind: 'set-unit-formation', unitKey: 'u0', formation: 'strategic-reserves', playerId: BOB }],
      ),
    )
    expect(state.players[1]?.units[0]?.formation).toBe('strategic-reserves')
  })

  it('lets one participant arrange another army after the battle starts', () => {
    const history = log(
      [ALICE, builtRoster('Ultramarines', ['Intercessors'])],
      [BOB, builtRoster('Death Guard', ['Plague Marines'])],
      [ALICE, { kind: 'begin-battle', firstPlayerId: ALICE }],
    )
    const command: Command = { kind: 'set-unit-formation', unitKey: 'u0', formation: 'strategic-reserves', playerId: BOB }

    expect(validate(reduceBattle(PLAYERS, history), ALICE, command)).toBeNull()
    expect(
      reduceBattle(PLAYERS, [...history, { seq: history.length + 1, by: ALICE, at: 9, command }]).players[1]?.units[0]?.formation,
    ).toBe('strategic-reserves')
  })

  it('tracks unit formation states without inventing model positions', () => {
    const state = reduceBattle(
      PLAYERS,
      log(
        [ALICE, builtRoster('Ultramarines', ['Intercessors'])],
        [ALICE, { kind: 'set-unit-formation', unitKey: 'u0', formation: 'strategic-reserves' }],
      ),
    )
    expect(state.players[0]?.units[0]?.formation).toBe('strategic-reserves')
  })

  it('allows a catalogue-backed deep strike formation', () => {
    const command = builtRoster('Death Guard', ['Lord of Virulence'])
    if (command.kind !== 'attach-roster' || !command.roster.built) throw new Error('expected a built roster')
    command.roster.built.units[0].formationOptions = ['deep-strike']
    const state = reduceBattle(PLAYERS, log([ALICE, command]))

    expect(validate(state, ALICE, { kind: 'set-unit-formation', unitKey: 'u0', formation: 'deep-strike' })).toBeNull()
  })

  it('refuses a deep strike formation absent from catalogue data', () => {
    const state = reduceBattle(PLAYERS, log([ALICE, builtRoster('Ultramarines', ['Intercessors'])]))

    expect(validate(state, ALICE, { kind: 'set-unit-formation', unitKey: 'u0', formation: 'deep-strike' })).toBe(
      'the roster data does not support that formation',
    )
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

  it('lets either player undo the latest command', () => {
    const state = reduceBattle(PLAYERS, log(...started(), [ALICE, { kind: 'score', category: 'primary', delta: 5 }]))
    expect(validate(state, BOB, { kind: 'undo', target: state.undoable?.seq ?? 0 })).toBeNull()
  })

  it('keeps rewinding across player turns', () => {
    const history = log(...started(), [ALICE, { kind: 'advance' }], [BOB, { kind: 'score', category: 'primary', delta: 5 }])
    const firstUndo = reduceBattle(PLAYERS, [
      ...history,
      { seq: history.length + 1, by: ALICE, at: 9, command: { kind: 'undo', target: history.length } },
    ])

    expect(validate(firstUndo, BOB, { kind: 'undo', target: firstUndo.undoable?.seq ?? 0 })).toBeNull()
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
  it('offers the latest undo to both players', () => {
    const state = reduceBattle(PLAYERS, log(...started(), [ALICE, { kind: 'score', category: 'primary', delta: 5 }]))
    expect(battleView({ token: 'abc' }, NAMES, state, BOB).undoable).toBe(state.undoable?.seq)
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

  it('cost the named amount when the board makes them dearer', () => {
    const state = reduceBattle(PLAYERS, log(...armed(), [ALICE, { kind: 'use-stratagem', key: 's1', cp: 2 }]))
    expect(alice(state)?.cp).toBe(2)
  })

  it('are refused when the named amount is more than the player holds', () => {
    const state = reduceBattle(PLAYERS, log(...armed()))
    expect(validate(state, ALICE, { kind: 'use-stratagem', key: 's1', cp: 5 })).toBe('not enough command points')
  })

  it('are refused a cost outside what a stratagem may ever charge', () => {
    const state = reduceBattle(PLAYERS, log(...armed()))
    expect(validate(state, ALICE, { kind: 'use-stratagem', key: 's1', cp: 99 })).toBe('that is not a possible cost')
  })

  it('expose a usage count in the battle view', () => {
    const state = reduceBattle(PLAYERS, log(...armed(), [ALICE, { kind: 'use-stratagem', key: 's1' }]))
    expect(battleView({ token: 'abc' }, NAMES, state, ALICE).players[0]?.stratagems[0]?.uses).toBe(1)
  })

  it('cannot be used twice in the same turn when that is the limit', () => {
    const state = reduceBattle(PLAYERS, log(...armed(), [ALICE, { kind: 'use-stratagem', key: 's1' }]))
    expect(validate(state, ALICE, { kind: 'use-stratagem', key: 's1' })).toBe('Grenade has been used this turn')
  })

  it('keeps battle usage when prep is edited', () => {
    const battleLimited = { ...STRAT, limit: 'battle' as const }
    const state = reduceBattle(
      PLAYERS,
      log(
        ...started(),
        [ALICE, { kind: 'set-prep', stratagems: [battleLimited], secondaries: [], primary: null, secondaryMode: 'fixed' }],
        [ALICE, { kind: 'adjust-cp', delta: 3 }],
        [ALICE, { kind: 'use-stratagem', key: battleLimited.key }],
        [ALICE, { kind: 'set-prep', stratagems: [battleLimited], secondaries: [], primary: null, secondaryMode: 'fixed' }],
      ),
    )

    expect(validate(state, ALICE, { kind: 'use-stratagem', key: battleLimited.key })).toBe('Grenade has been used this battle')
  })

  it('come back round in the next turn', () => {
    const history = log(...armed(), [ALICE, { kind: 'use-stratagem', key: 's1' }], ...turns(6, ALICE))
    expect(validate(reduceBattle(PLAYERS, history), ALICE, { kind: 'use-stratagem', key: 's1' })).toBeNull()
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

  it('can be used by another participant on the player’s behalf', () => {
    const command: Command = { kind: 'use-stratagem', key: 's1', playerId: ALICE }
    const state = reduceBattle(PLAYERS, log(...armed(), [BOB, command]))

    expect(validate(reduceBattle(PLAYERS, log(...armed())), BOB, command)).toBeNull()
    expect(alice(state)).toMatchObject({ cp: 3, uses: [{ key: 's1' }] })
  })

  it('are offered to the interface with the reason they cannot be used', () => {
    const state = reduceBattle(PLAYERS, log(...armed(), [ALICE, { kind: 'use-stratagem', key: 's1' }]))
    const view = battleView({ token: 'abc' }, NAMES, state, ALICE)
    expect(view.players.find((player) => player.isViewer)?.stratagems[0]?.refusal).toBe('Grenade has been used this turn')
  })

  it('enforces authoritative phase timing', () => {
    const timed = { ...STRAT, phases: ['fight'] as ['fight'] }
    const state = reduceBattle(
      PLAYERS,
      log(...started(), [ALICE, { kind: 'set-prep', stratagems: [timed], secondaries: [], primary: null, secondaryMode: 'fixed' }]),
    )
    expect(validate(state, ALICE, { kind: 'use-stratagem', key: timed.key })).toBe('Grenade cannot be used in this phase')
  })

  it('allows an authoritative phase when it arrives', () => {
    const timed = { ...STRAT, phases: ['fight'] as ['fight'] }
    const state = reduceBattle(
      PLAYERS,
      log(
        ...started(),
        [ALICE, { kind: 'set-prep', stratagems: [timed], secondaries: [], primary: null, secondaryMode: 'fixed' }],
        ...turns(4, ALICE),
      ),
    )
    expect(validate(state, ALICE, { kind: 'use-stratagem', key: timed.key })).toBeNull()
  })

  it('enforces opponent-turn timing independently', () => {
    const timed = { ...STRAT, turn: 'opponent-turn' as const }
    const state = reduceBattle(
      PLAYERS,
      log(...started(), [ALICE, { kind: 'set-prep', stratagems: [timed], secondaries: [], primary: null, secondaryMode: 'fixed' }]),
    )
    expect(validate(state, ALICE, { kind: 'use-stratagem', key: timed.key })).toBe('Grenade is used on your opponent’s turn')
  })

  it('allows opponent-turn timing on the opponent’s turn', () => {
    const timed = { ...STRAT, turn: 'opponent-turn' as const }
    const state = reduceBattle(
      PLAYERS,
      log(
        ...started(),
        [ALICE, { kind: 'set-prep', stratagems: [timed], secondaries: [], primary: null, secondaryMode: 'fixed' }],
        ...turns(6, ALICE),
      ),
    )
    expect(validate(state, ALICE, { kind: 'use-stratagem', key: timed.key })).toBeNull()
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

  it.each(['achieved', 'discarded', 'returned'] as const)('carries %s lifecycle state into the view', (status) => {
    const state = reduceBattle(PLAYERS, log(...named(), [ALICE, { kind: 'set-secondary-status', key: 'a', status }]))
    expect(battleView({ token: 'abc' }, NAMES, state, ALICE).players[0]?.secondaries[0]?.status).toBe(status)
  })

  it('reports putting a card back differently from giving up on it', () => {
    const returned = log(...named(), [ALICE, { kind: 'set-secondary-status', key: 'a', status: 'returned' }])
    expect(text(battleReport(NAMES, returned))).toContain('Alice puts Behind Enemy Lines back in the deck')

    const discarded = log(...named(), [ALICE, { kind: 'set-secondary-status', key: 'a', status: 'discarded' }])
    expect(text(battleReport(NAMES, discarded))).toContain('Alice marks Behind Enemy Lines discarded')
  })

  it('withhold a secret mission from the opponent until it is revealed', () => {
    const history = log(...started(), [ALICE, { kind: 'select-secret', secondary: { key: 'secret-a', name: 'Hold the Line' } }])
    const state = reduceBattle(PLAYERS, history)

    expect(battleView({ token: 'abc' }, NAMES, state, BOB).players[0]?.secondaries[0]?.name).toBe('Secret mission')
    expect(battleView({ token: 'abc' }, NAMES, state, ALICE).players[0]?.secondaries[0]?.name).toBe('Hold the Line')
  })

  it('reveal a secret mission when it is achieved', () => {
    const history = log(
      ...started(),
      [ALICE, { kind: 'select-secret', secondary: { key: 'secret-a', name: 'Hold the Line' } }],
      [ALICE, { kind: 'set-secondary-status', key: 'secret-a', status: 'achieved' }],
    )

    expect(battleView({ token: 'abc' }, NAMES, reduceBattle(PLAYERS, history), BOB).players[0]?.secondaries[0]?.name).toBe('Hold the Line')
  })

  it('redact a secret mission from the opponent report', () => {
    const history = log(...started(), [ALICE, { kind: 'select-secret', secondary: { key: 'secret-a', name: 'Hold the Line' } }])

    expect(text(battleReport(NAMES, history, PLAYERS, BOB))).toContain('Alice selects a secret mission')
    expect(text(battleReport(NAMES, history, PLAYERS, BOB)).join(' ')).not.toContain('Hold the Line')
  })

  it('keep an opponent from revealing a secret mission', () => {
    const state = reduceBattle(
      PLAYERS,
      log(...started(), [ALICE, { kind: 'select-secret', secondary: { key: 'secret-a', name: 'Hold the Line' } }]),
    )

    expect(validate(state, BOB, { kind: 'reveal-secret', playerId: ALICE })).toBe('that is not one of your secondaries')
  })

  it('give the same answer when an opponent guesses a hidden or absent secondary key', () => {
    const state = reduceBattle(
      PLAYERS,
      log(...started(), [ALICE, { kind: 'select-secret', secondary: { key: 'secret-a', name: 'Hold the Line' } }]),
    )
    const hidden = validate(state, BOB, { kind: 'score-secondary', key: 'secret-a', delta: 5, playerId: ALICE })
    const absent = validate(state, BOB, { kind: 'score-secondary', key: 'secret-b', delta: 5, playerId: ALICE })

    expect(hidden).toBe(absent)
  })

  it('hide secondary status keys from an opponent too', () => {
    const state = reduceBattle(
      PLAYERS,
      log(...started(), [ALICE, { kind: 'select-secret', secondary: { key: 'secret-a', name: 'Hold the Line' } }]),
    )
    const hidden = validate(state, BOB, { kind: 'set-secondary-status', key: 'secret-a', status: 'achieved', playerId: ALICE })
    const absent = validate(state, BOB, { kind: 'set-secondary-status', key: 'secret-b', status: 'achieved', playerId: ALICE })

    expect(hidden).toBe(absent)
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
        secondaryDeck: [
          { key: 'a', name: 'Behind Enemy Lines' },
          { key: 'b', name: 'Bring It Down' },
        ],
      },
    ]
    const state = reduceBattle(
      PLAYERS,
      log(...started(), tactical, [ALICE, { kind: 'draw-secondary', secondary: { key: 'b', name: 'Bring It Down' } }]),
    )
    expect(alice(state)?.secondaries.map((secondary) => secondary.name)).toEqual(['Behind Enemy Lines', 'Bring It Down'])
  })

  it('derives the remaining tactical deck from cards already seen', () => {
    const cards = [
      { key: 'a', name: 'Behind Enemy Lines' },
      { key: 'b', name: 'Bring It Down' },
      { key: 'c', name: 'Engage on All Fronts' },
    ]
    const state = reduceBattle(
      PLAYERS,
      log(...started(), [
        ALICE,
        {
          kind: 'set-prep',
          stratagems: [],
          primary: null,
          secondaryMode: 'tactical',
          secondaries: cards.slice(0, 2),
          secondaryDeck: cards,
        },
      ]),
    )
    expect(battleView({ token: 'abc' }, NAMES, state, ALICE).players[0]?.remainingSecondaries).toEqual([cards[2]])
  })

  it('withholds the remaining tactical deck from the opponent', () => {
    const cards = [
      { key: 'a', name: 'Behind Enemy Lines' },
      { key: 'b', name: 'Bring It Down' },
    ]
    const state = reduceBattle(
      PLAYERS,
      log(...started(), [
        ALICE,
        {
          kind: 'set-prep',
          stratagems: [],
          primary: null,
          secondaryMode: 'tactical',
          secondaries: cards.slice(0, 1),
          secondaryDeck: cards,
        },
      ]),
    )

    expect(battleView({ token: 'abc' }, NAMES, state, BOB).players[0]?.remainingSecondaries).toEqual([])
  })

  it('withholds the side captain’s remaining tactical deck from an ally', () => {
    const configure: Command = {
      kind: 'configure-battle',
      limit: 2000,
      missionPackId: null,
      terrainLayoutId: null,
      twistId: null,
      solo: false,
      teamBattle: true,
      clockLimitMinutes: null,
    }
    const cards = [
      { key: 'a', name: 'Behind Enemy Lines' },
      { key: 'b', name: 'Bring It Down' },
    ]
    const state = reduceBattle(
      [ALICE, BOB, CAROL],
      log(
        [ALICE, configure],
        [ALICE, roster('Knights')],
        [BOB, roster('Marines')],
        [CAROL, roster('Guard')],
        [
          BOB,
          {
            kind: 'set-prep',
            stratagems: [],
            primary: null,
            secondaryMode: 'tactical',
            secondaries: cards.slice(0, 1),
            secondaryDeck: cards,
          },
        ],
      ),
      [0, 1, 1],
    )

    const ally = battleView({ token: 'abc' }, [...NAMES, { id: CAROL, name: 'Carol' }], state, CAROL).players.find(
      (player) => player.id === CAROL,
    )
    expect(ally?.remainingSecondaries).toEqual([])
  })

  it('withholds secret scoring details from the opponent', () => {
    const state = reduceBattle(
      PLAYERS,
      log(...started(), [ALICE, { kind: 'select-secret', secondary: { key: 'secret-a', name: 'Hold the Line' } }], ...turns(5, ALICE)),
    )

    expect(battleView({ token: 'abc' }, NAMES, state, BOB).advancePrompt).toBe('The active side has an action to settle.')
  })

  it('lets legacy tactical battles continue without an authoritative deck', () => {
    const state = reduceBattle(
      PLAYERS,
      log(...started(), [
        ALICE,
        {
          kind: 'set-prep',
          stratagems: [],
          primary: null,
          secondaryMode: 'tactical',
          secondaries: [{ key: 'a', name: 'Behind Enemy Lines' }],
        },
      ]),
    )

    expect(validate(state, ALICE, { kind: 'draw-secondary', secondary: { key: 'b', name: 'Bring It Down' } })).toBeNull()
  })

  it('refuses a draw outside the authoritative deck', () => {
    const state = reduceBattle(
      PLAYERS,
      log(...started(), [
        ALICE,
        {
          kind: 'set-prep',
          stratagems: [],
          primary: null,
          secondaryMode: 'tactical',
          secondaries: [],
          secondaryDeck: [{ key: 'a', name: 'Behind Enemy Lines' }],
        },
      ]),
    )

    expect(validate(state, ALICE, { kind: 'draw-secondary', secondary: { key: 'b', name: 'Bring It Down' } })).toBe(
      'that secondary is not in your deck',
    )
  })

  it('refuses to draw past a full tactical hand', () => {
    const cards = [
      { key: 'a', name: 'Behind Enemy Lines' },
      { key: 'b', name: 'Bring It Down' },
      { key: 'c', name: 'Area Denial' },
    ]
    const state = reduceBattle(
      PLAYERS,
      log(...started(), [
        ALICE,
        {
          kind: 'set-prep',
          stratagems: [],
          primary: null,
          secondaryMode: 'tactical',
          secondaries: cards.slice(0, 2),
          secondaryDeck: cards,
        },
      ]),
    )

    expect(validate(state, ALICE, { kind: 'draw-secondary', secondary: cards[2] })).toBe('your tactical hand is full')
  })

  it('refuses a secret outside the authoritative deck', () => {
    const state = reduceBattle(
      PLAYERS,
      log(...started(), [
        ALICE,
        {
          kind: 'set-prep',
          stratagems: [],
          primary: null,
          secondaryMode: 'tactical',
          secondaries: [],
          secondaryDeck: [{ key: 'a', name: 'Behind Enemy Lines' }],
        },
      ]),
    )

    expect(validate(state, ALICE, { kind: 'select-secret', secondary: { key: 'b', name: 'Bring It Down' } })).toBe(
      'that secondary is not in your deck',
    )
  })

  it('uses the deck name when a draw payload is altered', () => {
    const state = reduceBattle(
      PLAYERS,
      log(
        ...started(),
        [
          ALICE,
          {
            kind: 'set-prep',
            stratagems: [],
            primary: null,
            secondaryMode: 'tactical',
            secondaries: [],
            secondaryDeck: [{ key: 'a', name: 'Behind Enemy Lines' }],
          },
        ],
        [ALICE, { kind: 'draw-secondary', secondary: { key: 'a', name: 'Altered' } }],
      ),
    )

    expect(state.players[0]?.secondaries[0]?.name).toBe('Behind Enemy Lines')
  })

  it('uses the deck name when a secret payload is altered', () => {
    const state = reduceBattle(
      PLAYERS,
      log(
        ...started(),
        [
          ALICE,
          {
            kind: 'set-prep',
            stratagems: [],
            primary: null,
            secondaryMode: 'tactical',
            secondaries: [],
            secondaryDeck: [{ key: 'a', name: 'Behind Enemy Lines' }],
          },
        ],
        [ALICE, { kind: 'select-secret', secondary: { key: 'a', name: 'Altered' } }],
      ),
    )

    expect(state.players[0]?.secondaries[0]?.name).toBe('Behind Enemy Lines')
  })

  it('keeps score corrections in the round ledger when prep changes', () => {
    const state = reduceBattle(
      PLAYERS,
      log(
        ...named(),
        [ALICE, { kind: 'correct-player', playerId: ALICE, resource: 'secondary', delta: 3 }],
        [
          ALICE,
          { kind: 'set-prep', stratagems: [], secondaries: [{ key: 'b', name: 'Bring It Down' }], primary: null, secondaryMode: 'fixed' },
        ],
      ),
    )

    expect(battleView({ token: 'abc' }, NAMES, state, ALICE).players[0]?.rounds[0]?.secondary).toBe(3)
  })

  it('keeps unnamed secondary scores when a roster applies saved prep', () => {
    const replacement = roster('Replacement')
    if (replacement.kind !== 'attach-roster') throw new Error('expected an attached roster')
    replacement.prep = null
    const state = reduceBattle(
      PLAYERS,
      log(...started(), [ALICE, { kind: 'score', category: 'secondary', delta: 5 }], [ALICE, replacement]),
    )

    const player = battleView({ token: 'abc' }, NAMES, state, ALICE).players[0]
    expect(player?.secondary).toBe(5)
    expect(player?.rounds[0]?.secondary).toBe(5)
  })

  it('prompts before passing a turn with an unresolved active mission', () => {
    const state = reduceBattle(
      PLAYERS,
      log(
        ...started(),
        [
          ALICE,
          {
            kind: 'set-prep',
            stratagems: [],
            primary: null,
            secondaryMode: 'tactical',
            secondaries: [{ key: 'a', name: 'Bring It Down' }],
          },
        ],
        ...turns(5, ALICE),
      ),
    )
    expect(battleView({ token: 'abc' }, NAMES, state, ALICE).advancePrompt).toContain('Bring It Down')
  })

  it('prompts again when an active mission has not scored this round', () => {
    const state = reduceBattle(
      PLAYERS,
      log(
        ...started(),
        [
          ALICE,
          {
            kind: 'set-prep',
            stratagems: [],
            primary: null,
            secondaryMode: 'tactical',
            secondaries: [{ key: 'a', name: 'Bring It Down' }],
          },
        ],
        [ALICE, { kind: 'score-secondary', key: 'a', delta: 5 }],
        ...turns(6, ALICE),
        ...turns(6, BOB),
        ...turns(5, ALICE),
      ),
    )
    expect(battleView({ token: 'abc' }, NAMES, state, ALICE).advancePrompt).toContain('Bring It Down')
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

  it('starts every unit on the battlefield', () => {
    const state = reduceBattle(PLAYERS, log(...withUnits()))
    expect(alice(state)?.units.every((unit) => unit.deployed)).toBe(true)
  })

  it('keeps supporting legacy commands that move a unit to reserve', () => {
    const state = reduceBattle(PLAYERS, log(...withUnits(), [ALICE, { kind: 'deploy-unit', unitKey: 'u0', deployed: false }]))
    expect(battleView({ token: 'abc' }, NAMES, state, ALICE).players.find((player) => player.isViewer)?.deployed).toBe(1)
  })

  it('leaves untouched units on the battlefield', () => {
    const state = reduceBattle(PLAYERS, log(...withUnits(), [ALICE, { kind: 'deploy-unit', unitKey: 'u0', deployed: false }]))
    expect(alice(state)?.units.find((unit) => unit.key === 'u1')?.deployed).toBe(true)
  })

  it('belongs to the player whose unit it is', () => {
    const state = reduceBattle(PLAYERS, log(...withUnits()))
    expect(validate(state, BOB, { kind: 'deploy-unit', unitKey: 'u0', deployed: true })).toBe('that is not one of your units')
  })

  it('shares the battlefield: either player may set it', () => {
    const state = reduceBattle(PLAYERS, log(...withUnits(), [BOB, { kind: 'set-deployment', patternId: 'tipping-point' }]))
    expect(state.deploymentId).toBe('tipping-point')
  })

  it('sets a combined deployment and terrain layout atomically', () => {
    const state = reduceBattle(
      PLAYERS,
      log(...withUnits(), [BOB, { kind: 'set-battlefield', patternId: 'tipping-point', terrainLayoutId: 'layout-b' }]),
    )
    expect(state).toMatchObject({ deploymentId: 'tipping-point', settings: { terrainLayoutId: 'layout-b' } })
  })

  it('refuses to move the zones once the battle has started', () => {
    const state = reduceBattle(PLAYERS, log(...started()))
    expect(validate(state, ALICE, { kind: 'set-deployment', patternId: 'tipping-point' })).toBe('the battle has started')
  })

  it('refuses to replace the combined battlefield once the battle has started', () => {
    const state = reduceBattle(PLAYERS, log(...started()))
    expect(validate(state, ALICE, { kind: 'set-battlefield', patternId: 'tipping-point', terrainLayoutId: 'layout-b' })).toBe(
      'the battle has started',
    )
  })

  it('counts a destroyed unit as no longer on the table', () => {
    const history = log(
      ...withUnits(),
      [ALICE, { kind: 'deploy-unit', unitKey: 'u0', deployed: true }],
      [ALICE, { kind: 'begin-battle', firstPlayerId: ALICE }],
      [ALICE, { kind: 'set-unit', unitKey: 'u0', destroyed: true }],
    )
    expect(battleView({ token: 'abc' }, NAMES, reduceBattle(PLAYERS, history), ALICE).players[0]?.deployed).toBe(1)
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

  it('names both players when one records an action for another', () => {
    const history = log(...started(), [BOB, { kind: 'adjust-cp', delta: 2, playerId: ALICE }])

    expect(text(battleReport(NAMES, history))).toContain('Bob adds 2 CP for Alice')
  })

  it('uses shared side details when a teammate is named as the target', () => {
    const configure: Command = {
      kind: 'configure-battle',
      limit: 2000,
      missionPackId: null,
      terrainLayoutId: null,
      twistId: null,
      solo: false,
      teamBattle: true,
      clockLimitMinutes: null,
    }
    const history = log(
      [ALICE, configure],
      [ALICE, roster('Knights')],
      [BOB, roster('Marines')],
      [CAROL, roster('Guard')],
      [
        BOB,
        {
          kind: 'set-prep',
          stratagems: [{ key: 's1', name: 'Grenade', cp: 1, limit: 'turn' }],
          secondaries: [],
          primary: null,
          secondaryMode: 'fixed',
        },
      ],
      [ALICE, { kind: 'begin-battle', firstPlayerId: ALICE }],
      [BOB, { kind: 'adjust-cp', delta: 1 }],
      [ALICE, { kind: 'use-stratagem', key: 's1', playerId: CAROL }],
    )

    expect(text(battleReport([...NAMES, { id: CAROL, name: 'Carol' }], history, [ALICE, BOB, CAROL], ALICE, [0, 1, 1]))).toContain(
      'Alice uses Carol’s Grenade for 1 CP',
    )
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

  it('name the recorder and owner when another player removes the last model', () => {
    const history = log(...inPlay(), [BOB, { kind: 'wound-unit', unitKey: 'u0', delta: -5, playerId: ALICE }])

    expect(text(battleReport(NAMES, history))).toContain('Bob removes the last model from Alice’s Intercessors')
  })

  it('read as models in the account otherwise', () => {
    const history = log(...inPlay(), [ALICE, { kind: 'wound-unit', unitKey: 'u0', delta: -1 }])
    expect(text(battleReport(NAMES, history))).toContain('Alice loses 1 model from Intercessors')
  })
})

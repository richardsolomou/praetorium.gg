import { describe, expect, it } from 'vitest'
import { BATTLE_ROUNDS, type Command, detachmentLimit, formatDatasheetLimit, reduceBattle, validate } from './battle'
import { battleView } from './battleView'
import { battleReport } from './battleReport'
import { ALICE, BOB, CAROL, NAMES, PLAYERS, advance, builtRoster, log, roster, started, text, turns } from './battle.fixtures'

describe('setup', () => {
  it('shares the current setup section with every player', () => {
    const state = reduceBattle(PLAYERS, log([BOB, { kind: 'set-setup-step', step: 2 }]))

    expect(battleView({ token: 'shared-step' }, NAMES, state, ALICE).setupStep).toBe(2)
  })

  it('records deployment order before the first-turn roll-off', () => {
    const state = reduceBattle(
      PLAYERS,
      log(
        [ALICE, roster('Alice army')],
        [BOB, roster('Bob army')],
        [BOB, { kind: 'set-attacker', attackerId: BOB }],
        [ALICE, { kind: 'begin-battle', firstPlayerId: ALICE }],
      ),
    )

    expect(state).toMatchObject({ attackerId: BOB, firstPlayerId: ALICE, activePlayerId: ALICE })
  })

  it('clears deployment order when setup is reset', () => {
    const state = reduceBattle(PLAYERS, log([ALICE, { kind: 'set-attacker', attackerId: BOB }], [ALICE, { kind: 'reset-setup' }]))
    expect(state.attackerId).toBeNull()
  })

  it('rejects an attacker who is not seated', () => {
    expect(validate(reduceBattle(PLAYERS, log()), ALICE, { kind: 'set-attacker', attackerId: CAROL })).toBe(
      'that attacker is not in this battle',
    )
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
        [CAROL, { kind: 'adjust-cp', delta: 1 }],
      ),
      [0, 1, 1],
    )
    const view = battleView({ token: 'team' }, [...NAMES, { id: CAROL, name: 'Carol' }], state, CAROL)

    expect(view.players.map((player) => ({ name: player.roster?.name, cp: player.cp }))).toEqual([
      { name: 'Knights', cp: 0 },
      { name: 'Marines', cp: 2 },
      { name: 'Guard', cp: 2 },
    ])
    expect(validate(state, BOB, { kind: 'adjust-cp', delta: 1 })).toBe(
      'a side can gain at most 1 additional command point per battle round',
    )
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

  it('lets anyone at the table advance a side with cards still to draw, and says what is owed', () => {
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

    const state = reduceBattle(PLAYERS, history)

    expect(validate(state, BOB, { kind: 'advance', playerId: ALICE })).toBeNull()
    expect(battleView({ token: 'abc' }, NAMES, state, BOB).advancePrompt).toBe('The active side has secondary missions to draw.')
  })

  it('says the previous turn is unsettled without holding the turn back for it', () => {
    const history = log(...started(), ...turns(6, ALICE))
    const pending = reduceBattle(PLAYERS, history)

    expect(validate(pending, ALICE, { kind: 'advance', playerId: BOB })).toBeNull()
    expect(battleView({ token: 'abc' }, NAMES, pending, ALICE).advancePrompt).toBe('The previous turn is still to be settled.')
    expect(validate(pending, BOB, { kind: 'settle-opponent-turn' })).toBeNull()

    const settled = reduceBattle(PLAYERS, log(...started(), ...turns(6, ALICE), [BOB, { kind: 'settle-opponent-turn' }]))
    expect(battleView({ token: 'abc' }, NAMES, settled, ALICE).advancePrompt).toBeNull()
  })

  it('shows pending opponent-turn scoring and its owner to every seated player', () => {
    const state = reduceBattle(PLAYERS, log(...started(), ...turns(6, ALICE)))

    expect(battleView({ token: 'abc' }, NAMES, state, BOB)).toMatchObject({ settlementRound: 1, settlementPlayerId: BOB })
    expect(battleView({ token: 'abc' }, NAMES, state, ALICE)).toMatchObject({ settlementRound: 1, settlementPlayerId: BOB })
  })

  it('treats an existing owner advance as settling the previous turn', () => {
    const state = reduceBattle(PLAYERS, log(...started(), ...turns(6, ALICE), [BOB, advance()]))

    expect(state.phase).toBe('movement')
    expect(battleView({ token: 'abc' }, NAMES, state, BOB).settlementRound).toBeNull()
  })

  it('lets an ally settle the side captain’s previous turn once', () => {
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

    expect(validate(state, CAROL, { kind: 'settle-opponent-turn' })).toBeNull()
  })

  it('does not let the opposing side dismiss an unrevealed mission', () => {
    const state = reduceBattle(
      PLAYERS,
      log(...started(), [BOB, { kind: 'select-secret', secondary: { key: 'secret', name: 'Hidden purpose' } }], ...turns(6, ALICE)),
    )

    expect(validate(state, ALICE, { kind: 'settle-opponent-turn' })).toBe('the affected side has a hidden action to settle')
    expect(validate(state, BOB, { kind: 'settle-opponent-turn' })).toBeNull()
  })

  it('keeps settlement bookkeeping out of the report and undo target', () => {
    const history = log(...started(), ...turns(6, ALICE), [BOB, { kind: 'settle-opponent-turn' }])
    const state = reduceBattle(PLAYERS, history)

    expect(battleView({ token: 'abc' }, NAMES, state, BOB).undoable).toBe(history.at(-2)?.seq)
    expect(battleReport(NAMES, history).some((entry) => entry.commandKind === 'settle-opponent-turn')).toBe(false)
  })

  it('lets an ally draw and advance for the side they share', () => {
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

    const state = reduceBattle([ALICE, BOB, CAROL], history, [0, 1, 1])
    const named = [...NAMES, { id: CAROL, name: 'Carol' }]

    expect(validate(state, CAROL, { kind: 'advance', playerId: BOB })).toBeNull()
    // The pair share one hand, so the ally can see the deck it is drawn from.
    expect(battleView({ token: 'abc' }, named, state, CAROL).players.find((player) => player.id === CAROL)?.remainingSecondaries).toEqual([
      { key: 'a', name: 'Area Denial' },
    ])
  })

  it('asks the active side to settle its hidden mission without refusing the turn', () => {
    const history = log(
      ...started(),
      [ALICE, { kind: 'select-secret', secondary: { key: 'secret-a', name: 'Hold the Line' } }],
      ...turns(5, ALICE),
    )
    const state = reduceBattle(PLAYERS, history)

    expect(validate(state, BOB, { kind: 'advance', playerId: ALICE })).toBeNull()
    // Still the one thing an opponent's screen cannot answer, so the reminder says a
    // card is outstanding without saying which.
    expect(battleView({ token: 'abc' }, NAMES, state, BOB).advancePrompt).toBe('The active side has a secret mission to reveal or discard.')
    expect(battleView({ token: 'abc' }, NAMES, state, BOB).players[0]?.secondaries[0]?.name).toBe('Secret mission')
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

describe('the round a settlement belongs to', () => {
  /** Both turns of round one taken, so round two is waiting on what round one owed Alice. */
  const boundary = () => log(...started(), ...turns(6, ALICE), ...turns(6, BOB))

  it('waits on the round that the ended turn was in', () => {
    const state = reduceBattle(PLAYERS, boundary())
    expect({ round: state.round, pending: state.pendingSettlement }).toEqual({
      round: 2,
      pending: { playerId: ALICE, round: 1 },
    })
  })

  it('banks what the previous turn owed against that round, not the one now being played', () => {
    const history = boundary()
    const state = reduceBattle(PLAYERS, [
      ...history,
      {
        seq: history.length + 1,
        by: ALICE,
        at: history.length,
        command: { kind: 'score-settlement', round: 1, scores: [{ category: 'primary', delta: 7 }] },
      },
    ])
    const alice = state.players.find((player) => player.id === ALICE)

    expect(alice?.primary).toBe(7)
    expect(alice?.primaryByRound.slice(0, 2)).toEqual([7, 0])
  })

  it('keeps a named secondary in the round its turn was in', () => {
    const history = log(
      [ALICE, roster('Ultramarines')],
      [BOB, roster('Death Guard')],
      [
        ALICE,
        {
          kind: 'set-prep',
          stratagems: [],
          secondaries: [{ key: 'beacon', name: 'Establish Locus' }],
          primary: null,
          secondaryMode: 'fixed',
        },
      ],
      [ALICE, { kind: 'begin-battle', firstPlayerId: ALICE }],
      ...turns(6, ALICE),
      ...turns(6, BOB),
    )
    const state = reduceBattle(PLAYERS, [
      ...history,
      {
        seq: history.length + 1,
        by: ALICE,
        at: history.length,
        command: { kind: 'score-settlement', round: 1, scores: [{ category: 'secondary', key: 'beacon', delta: 4 }] },
      },
    ])
    const alice = state.players.find((player) => player.id === ALICE)

    expect(alice?.secondaryByRound.slice(0, 2)).toEqual([4, 0])
    expect(alice?.scoredByRound.beacon?.slice(0, 2)).toEqual([4, 0])
  })

  it('leaves a log written before the round was named folding into the round being played', () => {
    const history = boundary()
    const state = reduceBattle(PLAYERS, [
      ...history,
      {
        seq: history.length + 1,
        by: ALICE,
        at: history.length,
        command: { kind: 'score-settlement', scores: [{ category: 'primary', delta: 7 }] },
      },
    ])

    expect(state.players.find((player) => player.id === ALICE)?.primaryByRound.slice(0, 2)).toEqual([0, 7])
  })

  it('refuses a round that is not the turn waiting to be settled', () => {
    const state = reduceBattle(PLAYERS, boundary())
    expect(validate(state, ALICE, { kind: 'score-settlement', round: 3, scores: [{ category: 'primary', delta: 7 }] })).toBe(
      'that is not the turn waiting to be settled',
    )
  })

  it('refuses a round named by the side the settlement is not waiting on', () => {
    const state = reduceBattle(PLAYERS, boundary())
    expect(validate(state, BOB, { kind: 'score-settlement', round: 1, scores: [{ category: 'primary', delta: 7 }] })).toBe(
      'that is not the turn waiting to be settled',
    )
  })

  it('takes the round being played without a settlement waiting', () => {
    const state = reduceBattle(PLAYERS, log(...started()))
    expect(validate(state, ALICE, { kind: 'score-settlement', round: 1, scores: [{ category: 'primary', delta: 7 }] })).toBeNull()
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
    const command: Command = { kind: 'adjust-cp', delta: 1, playerId: ALICE }
    const state = reduceBattle(PLAYERS, log(...started(), [BOB, command]))

    expect(validate(reduceBattle(PLAYERS, log(...started())), BOB, command)).toBeNull()
    expect(state.players.find((player) => player.id === ALICE)?.cp).toBe(2)
    expect(state.players.find((player) => player.id === BOB)?.cp).toBe(0)
  })

  it('caps additional gains without counting the command-phase point', () => {
    const gained = reduceBattle(PLAYERS, log(...started(), [ALICE, { kind: 'adjust-cp', delta: 1 }]))
    expect(validate(reduceBattle(PLAYERS, log(...started())), ALICE, { kind: 'adjust-cp', delta: 1 })).toBeNull()
    expect(validate(gained, ALICE, { kind: 'adjust-cp', delta: 1 })).toBe(
      'a side can gain at most 1 additional command point per battle round',
    )
    expect(validate(reduceBattle(PLAYERS, log(...started())), ALICE, { kind: 'adjust-cp', delta: 2 })).toBe(
      'a side can gain at most 1 additional command point per battle round',
    )
  })

  it('does not reopen the gain after spending and resets it next round', () => {
    const spent = reduceBattle(
      PLAYERS,
      log(...started(), [ALICE, { kind: 'adjust-cp', delta: 1 }], [ALICE, { kind: 'adjust-cp', delta: -1 }]),
    )
    expect(validate(spent, ALICE, { kind: 'adjust-cp', delta: 1 })).toBe(
      'a side can gain at most 1 additional command point per battle round',
    )

    const nextRound = reduceBattle(
      PLAYERS,
      log(...started(), [ALICE, { kind: 'adjust-cp', delta: 1 }], ...turns(6, ALICE), ...turns(6, BOB)),
    )
    expect(nextRound.round).toBe(2)
    expect(validate(nextRound, ALICE, { kind: 'adjust-cp', delta: 1 })).toBeNull()
  })

  it('leaves explicit corrections outside the additional-gain cap', () => {
    const state = reduceBattle(
      PLAYERS,
      log(
        ...started(),
        [ALICE, { kind: 'adjust-cp', delta: 1 }],
        [BOB, { kind: 'correct-player', playerId: ALICE, resource: 'cp', delta: 2 }],
      ),
    )
    expect(state.players.find((player) => player.id === ALICE)?.cp).toBe(4)
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
    command.roster.built.units[0]!.formationOptions = ['deep-strike']
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
  it('takes back a complete primary and secondary settlement at once', () => {
    const settlement: Command = {
      kind: 'score-settlement',
      scores: [
        { category: 'primary', delta: 5 },
        { category: 'secondary', key: 'beacon', delta: 4, status: 'achieved' },
        { category: 'secondary', key: 'assassination', delta: 3, status: 'achieved' },
      ],
    }
    const history = log(
      [ALICE, roster('Ultramarines')],
      [BOB, roster('Death Guard')],
      [
        ALICE,
        {
          kind: 'set-prep',
          stratagems: [],
          secondaries: [
            { key: 'beacon', name: 'Establish Locus' },
            { key: 'assassination', name: 'Assassination' },
          ],
          primary: null,
          secondaryMode: 'fixed',
        },
      ],
      [ALICE, { kind: 'begin-battle', firstPlayerId: ALICE }],
      [ALICE, settlement],
    )
    const scored = reduceBattle(PLAYERS, history)
    expect(scored.players[0]).toMatchObject({
      primary: 5,
      secondary: 7,
      secondaryStatus: { beacon: 'achieved', assassination: 'achieved' },
    })

    const undone = reduceBattle(PLAYERS, [
      ...history,
      { seq: history.length + 1, by: BOB, at: 9, command: { kind: 'undo', target: history.length } },
    ])
    expect(undone.players[0]).toMatchObject({ primary: 0, secondary: 0, secondaryStatus: { beacon: 'active', assassination: 'active' } })
  })

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

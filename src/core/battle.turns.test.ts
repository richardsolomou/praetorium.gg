import { describe, expect, it } from 'vitest'
import { BATTLE_ROUNDS, type Command, reduceBattle, validate } from './battle'
import { battleView } from './battleView'
import { battleReport } from './battleReport'
import { ALICE, BOB, CAROL, NAMES, PLAYERS, advance, log, roster, started, turns } from './battle.fixtures'

describe('the turn sequence', () => {
  it('grants both sides a command point as the battle opens', () => {
    const state = reduceBattle(PLAYERS, log(...started()))
    expect(state.players.map((player) => player.cp)).toEqual([1, 1])
  })

  it('grants both sides a command point at the start of every turn', () => {
    const firstTurns = reduceBattle(PLAYERS, log(...started(), ...turns(6, ALICE)))
    expect(firstTurns.players.map((player) => player.cp)).toEqual([2, 2])

    const nextRound = reduceBattle(PLAYERS, log(...started(), ...turns(6, ALICE), ...turns(6, BOB)))
    expect(nextRound.players.map((player) => player.cp)).toEqual([3, 3])
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

  it('settles the first player’s final opponent turn before finishing the battle', () => {
    const rounds = Array.from({ length: BATTLE_ROUNDS }, () => [...turns(6, ALICE), ...turns(6, BOB)]).flat()
    const waiting = reduceBattle(PLAYERS, log(...started(), ...rounds))
    const state = reduceBattle(
      PLAYERS,
      log(
        ...started(),
        ...rounds,
        [ALICE, { kind: 'score-settlement', round: BATTLE_ROUNDS, scores: [{ category: 'primary', delta: 5 }] }],
        [BOB, { kind: 'settle-opponent-turn' }],
      ),
    )

    expect(waiting).toMatchObject({
      status: 'playing',
      completionPending: true,
      pendingSettlement: { playerId: ALICE, round: BATTLE_ROUNDS },
    })
    expect(state).toMatchObject({ status: 'finished', completionPending: false, result: { reason: 'completed' } })
    expect(state.players[0]?.primaryByRound[BATTLE_ROUNDS - 1]).toBe(5)
    expect(state.turns.at(-1)?.endedAt).not.toBeNull()
  })

  it.each([500, 600])('finishes %i-point King of the Colosseum after five rounds', (limit) => {
    const configured: [string, Command] = [
      ALICE,
      {
        kind: 'configure-battle',
        limit,
        missionPackId: null,
        terrainLayoutId: null,
        twistId: null,
        clockLimitMinutes: null,
      },
    ]
    const rounds = Array.from({ length: BATTLE_ROUNDS }, () => [...turns(6, ALICE), ...turns(6, BOB)]).flat()
    const state = reduceBattle(PLAYERS, log(configured, ...started(), ...rounds, [ALICE, { kind: 'settle-opponent-turn' }]))
    const view = battleView({ token: 'abc' }, NAMES, state, ALICE)

    expect(state).toMatchObject({ status: 'finished', round: 5, result: { reason: 'completed' } })
    expect(view.rounds).toBe(5)
    expect(view.players[0]?.rounds).toHaveLength(5)
  })

  it('keeps the final battle round within the five-round ledger', () => {
    const rounds = Array.from({ length: BATTLE_ROUNDS }, () => [...turns(6, ALICE), ...turns(6, BOB)]).flat()
    const state = reduceBattle(PLAYERS, log(...started(), ...rounds))
    expect(state.round).toBe(BATTLE_ROUNDS)
  })

  // A one-seat battle can no longer be started, but the logs of the ones that were
  // still have to fold. These two read that history rather than describe a format.
  it('records each round of a one-seat log as its own turn', () => {
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

  it('completes all five rounds of a one-seat log', () => {
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

  it('shares an advance request without making it an undoable battle event', () => {
    const history = log(
      ...started(),
      [ALICE, { kind: 'score', category: 'primary', delta: 1 }],
      [BOB, { kind: 'request-advance', playerId: ALICE }],
    )
    const state = reduceBattle(PLAYERS, history)

    expect(validate(reduceBattle(PLAYERS, log(...started())), BOB, { kind: 'request-advance', playerId: ALICE })).toBeNull()
    expect(battleView({ token: 'abc' }, NAMES, state, ALICE).advanceRequested).toBe(true)
    expect(battleView({ token: 'abc' }, NAMES, state, BOB).advanceRequested).toBe(true)
    expect(state.undoable?.seq).toBe(history.at(-2)?.seq)
    expect(battleReport(NAMES, history).some((entry) => entry.commandKind === 'request-advance')).toBe(false)

    const cancelled = reduceBattle(
      PLAYERS,
      log(...started(), [BOB, { kind: 'request-advance', playerId: ALICE }], [ALICE, { kind: 'cancel-advance', playerId: ALICE }]),
    )
    expect(cancelled.advanceRequested).toBe(false)
  })

  it('shares that scoring was reviewed even when it paid no points', () => {
    const history = log(...started(), [ALICE, { kind: 'request-advance' }], [BOB, { kind: 'acknowledge-scoring', playerId: ALICE }])
    const state = reduceBattle(PLAYERS, history)

    expect(
      validate(reduceBattle(PLAYERS, log(...started(), [ALICE, { kind: 'request-advance' }])), BOB, {
        kind: 'acknowledge-scoring',
        playerId: ALICE,
      }),
    ).toBeNull()
    expect(battleView({ token: 'abc' }, NAMES, state, ALICE).scoringAcknowledged).toBe(true)
    expect(battleView({ token: 'abc' }, NAMES, state, BOB).scoringAcknowledged).toBe(true)
    expect(battleReport(NAMES, history).some((entry) => entry.commandKind === 'acknowledge-scoring')).toBe(false)
  })

  it('refuses to pass a scoring moment recorded with the battle until it is reviewed', () => {
    const award = {
      vp: 5,
      per: null,
      mode: null,
      max: null,
      group: null,
      cumulative: false,
      criteria: 'Control an objective marker.',
      trigger: { timing: 'end-of-phase', phase: 'command', playerTurn: 'your-turn', roundMin: null, roundMax: null },
    }
    const prepared: [string, Command][] = [
      ...started().slice(0, 2),
      [
        ALICE,
        {
          kind: 'set-prep',
          stratagems: [],
          secondaries: [],
          primary: { key: 'primary', name: 'Take and Hold', awards: [award] },
          secondaryMode: 'fixed',
        },
      ],
      [ALICE, { kind: 'begin-battle', firstPlayerId: ALICE }],
    ]
    const before = reduceBattle(PLAYERS, log(...prepared))
    const requested = reduceBattle(PLAYERS, log(...prepared, [ALICE, { kind: 'request-advance' }]))
    const reviewed = reduceBattle(PLAYERS, log(...prepared, [ALICE, { kind: 'request-advance' }], [ALICE, { kind: 'acknowledge-scoring' }]))

    expect(validate(before, ALICE, { kind: 'advance' })).toBe('review mission scoring before ending the phase')
    expect(validate(requested, ALICE, { kind: 'advance' })).toBe('finish mission scoring before ending the phase')
    expect(validate(reviewed, ALICE, { kind: 'advance' })).toBeNull()
    expect(battleView({ token: 'abc' }, NAMES, before, ALICE).players[0]?.primaryCard?.awards).toEqual([award])
  })

  it('moves a shared advance request past scoring when points are recorded', () => {
    const state = reduceBattle(
      PLAYERS,
      log(
        ...started(),
        [ALICE, { kind: 'request-advance' }],
        [BOB, { kind: 'score-settlement', playerId: ALICE, scores: [{ category: 'primary', delta: 3 }] }],
      ),
    )

    expect(state.scoringAcknowledged).toBe(true)
  })

  it('shares a completed tactical draw without replacing its undo target', () => {
    const actions: [string, Command][] = [
      ...started(),
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
      [ALICE, { kind: 'draw-secondaries', secondaries: [{ key: 'a', name: 'Area Denial' }] }],
    ]
    const before = reduceBattle(PLAYERS, log(...actions))
    const acknowledgedHistory = log(...actions, [BOB, { kind: 'acknowledge-draw', playerId: ALICE }])
    const acknowledged = reduceBattle(PLAYERS, acknowledgedHistory)

    expect(validate(before, BOB, { kind: 'acknowledge-draw', playerId: ALICE })).toBeNull()
    expect(validate(before, ALICE, { kind: 'request-advance' })).toBe('review the new secondary missions before ending the command phase')
    expect(validate(before, ALICE, { kind: 'advance' })).toBe('review the new secondary missions before ending the command phase')
    expect(battleView({ token: 'abc' }, NAMES, acknowledged, ALICE).drawAcknowledged).toBe(true)
    expect(battleView({ token: 'abc' }, NAMES, acknowledged, BOB).drawAcknowledged).toBe(true)
    expect(acknowledged.undoable?.kind).toBe('draw-secondaries')
    expect(battleReport(NAMES, acknowledgedHistory).some((entry) => entry.commandKind === 'acknowledge-draw')).toBe(false)

    const repaired = reduceBattle(
      PLAYERS,
      log(
        ...actions,
        [BOB, { kind: 'acknowledge-draw', playerId: ALICE }],
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
      ),
    )
    expect(repaired.drawAcknowledged).toBe(false)

    const drawSeq = acknowledged.undoable?.seq
    if (!drawSeq) throw new Error('The draw must be undoable')
    const undoneActions: [string, Command][] = [
      ...actions,
      [BOB, { kind: 'acknowledge-draw', playerId: ALICE }],
      [ALICE, { kind: 'undo', target: drawSeq }],
    ]
    expect(reduceBattle(PLAYERS, log(...undoneActions)).drawAcknowledged).toBe(true)

    const redrawn = reduceBattle(
      PLAYERS,
      log(...undoneActions, [BOB, { kind: 'draw-secondaries', playerId: ALICE, secondaries: [{ key: 'a', name: 'Area Denial' }] }]),
    )
    expect(redrawn.drawAcknowledged).toBe(false)
  })

  it('lets one seated player select and reveal the other side’s Secret Mission', () => {
    const selected = reduceBattle(
      PLAYERS,
      log(...started(), [ALICE, { kind: 'select-secret', playerId: BOB, secondary: { key: 'secret', name: 'Hidden purpose' } }]),
    )

    expect(
      validate(reduceBattle(PLAYERS, log(...started())), ALICE, {
        kind: 'select-secret',
        playerId: BOB,
        secondary: { key: 'secret', name: 'Hidden purpose' },
      }),
    ).toBeNull()
    expect(validate(selected, ALICE, { kind: 'reveal-secret', playerId: BOB })).toBeNull()
  })

  it('lets anyone at the table draw for a side but refuses to skip the draw', () => {
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

    expect(validate(state, BOB, { kind: 'request-advance', playerId: ALICE })).toBe('draw every card owed before ending the command phase')
    expect(validate(state, BOB, { kind: 'advance', playerId: ALICE })).toBe('draw every card owed before ending the command phase')
    expect(battleView({ token: 'abc' }, NAMES, state, BOB).advancePrompt).toBe('The active side has secondary missions to draw.')
  })

  it('holds the command phase until the previous turn is settled', () => {
    const history = log(...started(), ...turns(6, ALICE))
    const pending = reduceBattle(PLAYERS, history)

    expect(validate(pending, ALICE, { kind: 'advance', playerId: BOB })).toBe('settle the previous turn before ending the command phase')
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

  it('does not settle an unrevealed mission whose timing is unknown', () => {
    const state = reduceBattle(
      PLAYERS,
      log(...started(), [BOB, { kind: 'select-secret', secondary: { key: 'secret', name: 'Hidden purpose' } }], ...turns(6, ALICE)),
    )

    for (const player of [ALICE, BOB]) {
      expect(validate(state, player, { kind: 'settle-opponent-turn' })).toBe('reveal the secret mission before settling the previous turn')
    }
  })

  it('settles a hidden mission that has no opponent-turn award', () => {
    const award = {
      vp: 5,
      per: null,
      mode: null,
      max: null,
      group: null,
      cumulative: false,
      criteria: 'Hold the objective.',
      trigger: { timing: 'end-of-turn', phase: null, playerTurn: 'your-turn', roundMin: null, roundMax: null },
    }
    const state = reduceBattle(
      PLAYERS,
      log(
        ...started(),
        [BOB, { kind: 'select-secret', secondary: { key: 'secret', name: 'Hidden purpose', awards: [award] } }],
        ...turns(6, ALICE),
      ),
    )

    expect(validate(state, ALICE, { kind: 'settle-opponent-turn' })).toBeNull()
  })

  it('keeps settlement bookkeeping out of the report and undo target', () => {
    const history = log(...started(), ...turns(6, ALICE), [BOB, { kind: 'settle-opponent-turn' }])
    const state = reduceBattle(PLAYERS, history)

    expect(battleView({ token: 'abc' }, NAMES, state, BOB).undoable).toBe(history.at(-2)?.seq)
    expect(battleReport(NAMES, history).some((entry) => entry.commandKind === 'settle-opponent-turn')).toBe(false)
  })

  it('lets an ally draw for the side they share but refuses to skip the draw', () => {
    const configure: Command = {
      kind: 'configure-battle',
      limit: 2000,
      missionPackId: null,
      terrainLayoutId: null,
      twistId: null,
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

    expect(validate(state, CAROL, { kind: 'advance', playerId: BOB })).toBe('draw every card owed before ending the command phase')
    // The pair share one hand, so the ally can see the deck it is drawn from.
    expect(battleView({ token: 'abc' }, named, state, CAROL).players.find((player) => player.id === CAROL)?.remainingSecondaries).toEqual([
      { key: 'a', name: 'Area Denial' },
    ])
  })

  it('refuses to pass the turn until the active side settles its hidden mission', () => {
    const history = log(
      ...started(),
      [ALICE, { kind: 'select-secret', secondary: { key: 'secret-a', name: 'Hold the Line' } }],
      ...turns(5, ALICE),
    )
    const state = reduceBattle(PLAYERS, history)

    expect(validate(state, BOB, { kind: 'request-advance', playerId: ALICE })).toBeNull()
    expect(validate(state, BOB, { kind: 'advance', playerId: ALICE })).toBe('reveal or discard the secret mission before ending the turn')
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

  it('refuses a scoring request while previous-turn settlement is outstanding', () => {
    const state = reduceBattle(PLAYERS, boundary())

    expect(validate(state, ALICE, { kind: 'request-advance', playerId: ALICE })).toBe(
      'settle the previous turn before ending the command phase',
    )
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
    expect(state.players.find((player) => player.id === BOB)?.cp).toBe(1)
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

import { describe, expect, it } from 'vitest'
import { type Command, reduceBattle, validate } from './battle'
import { battleView } from './battleView'
import { battleReport } from './battleReport'
import { ALICE, BOB, CAROL, NAMES, PLAYERS, attachedRoster, builtRoster, log, roster, started, text } from './battle.fixtures'

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

  it('allows any seated player to record another player conceding', () => {
    const state = reduceBattle(PLAYERS, log(...started()))
    expect(validate(state, ALICE, { kind: 'end-battle', reason: 'conceded', concededBy: BOB })).toBeNull()
  })

  it('refuses a concession from someone outside the battle', () => {
    const state = reduceBattle(PLAYERS, log(...started()))
    expect(validate(state, ALICE, { kind: 'end-battle', reason: 'conceded', concededBy: CAROL })).toBe('that player is not in this battle')
  })

  it('does not let a practice opponent concede', () => {
    const state = reduceBattle(PLAYERS, log(...started()), undefined, [BOB])
    expect(validate(state, ALICE, { kind: 'end-battle', reason: 'conceded', concededBy: BOB })).toBe('a practice opponent cannot concede')
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

  it('pays the painted-army bonus as the battle begins', () => {
    const state = reduceBattle(PLAYERS, log([ALICE, { kind: 'set-painted', painted: true }], ...started()))
    expect(battleView({ token: 'abc' }, NAMES, state, ALICE).players[0]).toMatchObject({ painted: true, paintedPoints: 10, total: 10 })
  })

  it('keeps the painted-army bonus out of the total while the table is still setting up', () => {
    const state = reduceBattle(PLAYERS, log([ALICE, { kind: 'set-painted', painted: true }]))
    expect(battleView({ token: 'abc' }, NAMES, state, ALICE).players[0]).toMatchObject({ painted: true, paintedPoints: 10, total: 0 })
  })

  it('carries the painted-army bonus into the finished total', () => {
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

  it('limits strategic reserves and deep strike to half the army points limit', () => {
    const command = builtRoster('Death Guard', ['Plague Marines', 'Lord of Virulence', 'Foetid Bloat-drone'])
    if (command.kind !== 'attach-roster' || !command.roster.built) throw new Error('expected a built roster')
    command.roster.built.limit = 1_000
    command.roster.built.strategicReserveLimit = 500
    command.roster.built.units[0]!.points = 400
    command.roster.built.units[1]!.points = 100
    command.roster.built.units[1]!.formationOptions = ['deep-strike']
    command.roster.built.units[2]!.points = 1
    const state = reduceBattle(
      PLAYERS,
      log(
        [ALICE, command],
        [BOB, roster('Death Guard')],
        [ALICE, { kind: 'set-unit-formation', unitKey: 'u0', formation: 'strategic-reserves' }],
        [ALICE, { kind: 'set-unit-formation', unitKey: 'u1', formation: 'deep-strike' }],
      ),
    )

    expect(validate(state, ALICE, { kind: 'set-unit-formation', unitKey: 'u1', formation: 'deep-strike' })).toBeNull()
    expect(validate(state, ALICE, { kind: 'begin-battle', firstPlayerId: ALICE })).toBeNull()
    expect(validate(state, ALICE, { kind: 'set-unit-formation', unitKey: 'u2', formation: 'strategic-reserves' })).toBe(
      'no more than 500 points of this army can start in strategic reserves',
    )
    expect(validate(state, ALICE, { kind: 'deploy-unit', unitKey: 'u2', deployed: false })).toBe(
      'no more than 500 points of this army can start in strategic reserves',
    )
  })

  it('does not count source-declared or post-deployment reserve exemptions', () => {
    const command = builtRoster('Orks', ['Boyz', 'Dakkajet', 'Kommandos'])
    if (command.kind !== 'attach-roster' || !command.roster.built) throw new Error('expected a built roster')
    command.roster.built.limit = 2_000
    command.roster.built.strategicReserveLimit = 1_000
    command.roster.built.units[0]!.points = 1_000
    command.roster.built.units[1]!.points = 600
    command.roster.built.units[1]!.strategicReserveExempt = true
    command.roster.built.units[2]!.points = 200
    const beforeRoll = reduceBattle(
      PLAYERS,
      log(
        [ALICE, command],
        [BOB, roster('Death Guard')],
        [ALICE, { kind: 'set-unit-formation', unitKey: 'u0', formation: 'strategic-reserves' }],
        [ALICE, { kind: 'set-unit-formation', unitKey: 'u1', formation: 'strategic-reserves' }],
      ),
    )

    expect(validate(beforeRoll, ALICE, { kind: 'set-unit-formation', unitKey: 'u2', formation: 'strategic-reserves' })).toBe(
      'no more than 1000 points of this army can start in strategic reserves',
    )
    const state = reduceBattle(
      PLAYERS,
      log(
        [ALICE, command],
        [BOB, roster('Death Guard')],
        [ALICE, { kind: 'set-unit-formation', unitKey: 'u0', formation: 'strategic-reserves' }],
        [ALICE, { kind: 'set-unit-formation', unitKey: 'u1', formation: 'strategic-reserves' }],
        [ALICE, { kind: 'set-first-turn', firstPlayerId: ALICE }],
      ),
    )
    expect(
      validate(state, ALICE, {
        kind: 'set-unit-formation',
        unitKey: 'u2',
        formation: 'strategic-reserves',
      }),
    ).toBeNull()
    const exempt = reduceBattle(
      PLAYERS,
      log(
        [ALICE, command],
        [BOB, roster('Death Guard')],
        [ALICE, { kind: 'set-unit-formation', unitKey: 'u0', formation: 'strategic-reserves' }],
        [ALICE, { kind: 'set-unit-formation', unitKey: 'u1', formation: 'strategic-reserves' }],
        [ALICE, { kind: 'set-first-turn', firstPlayerId: ALICE }],
        [
          ALICE,
          {
            kind: 'set-unit-formation',
            unitKey: 'u2',
            formation: 'strategic-reserves',
          },
        ],
      ),
    )
    expect(exempt.players[0]?.units[2]).toMatchObject({ formation: 'strategic-reserves', postDeploymentReserve: true })
    expect(validate(exempt, ALICE, { kind: 'begin-battle', firstPlayerId: ALICE })).toBeNull()
  })

  it('applies a bearer exemption to their whole attached unit', () => {
    const command = attachedRoster()
    if (command.kind !== 'attach-roster' || !command.roster.built) throw new Error('expected a built roster')
    command.roster.built.limit = 1_000
    command.roster.built.strategicReserveLimit = 500
    command.roster.built.units[0]!.points = 600
    command.roster.built.units[1]!.strategicReserveExempt = true
    const state = reduceBattle(PLAYERS, log([ALICE, command]))

    expect(validate(state, ALICE, { kind: 'set-unit-formation', unitKey: 'u0', formation: 'strategic-reserves' })).toBeNull()
  })

  it('counts a non-exempt attached unit as one combined reserve formation', () => {
    const command = attachedRoster()
    if (command.kind !== 'attach-roster' || !command.roster.built) throw new Error('expected a built roster')
    command.roster.built.strategicReserveLimit = 150
    const state = reduceBattle(PLAYERS, log([ALICE, command]))

    expect(validate(state, ALICE, { kind: 'set-unit-formation', unitKey: 'u0', formation: 'strategic-reserves' })).toBe(
      'no more than 150 points of this army can start in strategic reserves',
    )
  })

  it('moves and validates a whole attached unit through the legacy deployment command', () => {
    const command = attachedRoster()
    if (command.kind !== 'attach-roster' || !command.roster.built) throw new Error('expected a built roster')
    command.roster.built.strategicReserveLimit = 150
    command.roster.built.units[1]!.strategicReserveExempt = true
    const state = reduceBattle(PLAYERS, log([ALICE, command]))
    const deployment: Command = { kind: 'deploy-unit', unitKey: 'u0', deployed: false }

    expect(validate(state, ALICE, deployment)).toBeNull()
    const deployed = reduceBattle(PLAYERS, log([ALICE, command], [ALICE, deployment]))
    expect(deployed.players[0]?.units.map((unit) => unit.formation)).toEqual(['strategic-reserves', 'strategic-reserves'])
  })

  it('does not let a battlefield exemption hide a malformed split reserve formation', () => {
    const command = attachedRoster()
    if (command.kind !== 'attach-roster' || !command.roster.built) throw new Error('expected a built roster')
    command.roster.built.strategicReserveLimit = 50
    command.roster.built.units[1]!.strategicReserveExempt = true
    const state = reduceBattle(PLAYERS, log([ALICE, command], [BOB, roster('Death Guard')]))
    state.players[0]!.units[0]!.formation = 'strategic-reserves'

    expect(validate(state, ALICE, { kind: 'begin-battle', firstPlayerId: ALICE })).toBe(
      'no more than 50 points of this army can start in strategic reserves',
    )
  })

  it('refuses to begin with a known setup over the strategic reserves limit', () => {
    const command = builtRoster('Ultramarines', ['Intercessors'])
    if (command.kind !== 'attach-roster' || !command.roster.built) throw new Error('expected a built roster')
    command.roster.built.strategicReserveLimit = 1_000
    command.roster.built.units[0]!.points = 1_001
    const state = reduceBattle(
      PLAYERS,
      log(
        [ALICE, command],
        [BOB, roster('Death Guard')],
        [ALICE, { kind: 'set-unit-formation', unitKey: 'u0', formation: 'strategic-reserves' }],
      ),
    )

    expect(validate(state, ALICE, { kind: 'begin-battle', firstPlayerId: ALICE })).toBe(
      'no more than 1000 points of this army can start in strategic reserves',
    )
  })

  it('keeps an older roster snapshot without reserve-limit facts startable', () => {
    const command = builtRoster('Ultramarines', ['Intercessors'])
    if (command.kind !== 'attach-roster' || !command.roster.built) throw new Error('expected a built roster')
    command.roster.built.units[0]!.points = 1_001
    const state = reduceBattle(
      PLAYERS,
      log(
        [ALICE, command],
        [BOB, roster('Death Guard')],
        [ALICE, { kind: 'set-unit-formation', unitKey: 'u0', formation: 'strategic-reserves' }],
      ),
    )

    expect(validate(state, ALICE, { kind: 'begin-battle', firstPlayerId: ALICE })).toBeNull()
  })

  it('allows an over-limit legacy setup to be corrected one unit at a time', () => {
    const command = builtRoster('Ultramarines', ['Intercessors', 'Hellblasters'])
    if (command.kind !== 'attach-roster' || !command.roster.built) throw new Error('expected a built roster')
    command.roster.built.limit = 1_000
    command.roster.built.strategicReserveLimit = 500
    command.roster.built.units[0]!.points = 600
    command.roster.built.units[1]!.points = 100
    const state = reduceBattle(
      PLAYERS,
      log(
        [ALICE, command],
        [ALICE, { kind: 'set-unit-formation', unitKey: 'u0', formation: 'strategic-reserves' }],
        [ALICE, { kind: 'set-unit-formation', unitKey: 'u1', formation: 'strategic-reserves' }],
      ),
    )

    expect(validate(state, ALICE, { kind: 'set-unit-formation', unitKey: 'u1', formation: 'battlefield' })).toBeNull()
  })

  it('does not apply the starting reserve limit to moves made during the battle', () => {
    const command = builtRoster('Ultramarines', ['Intercessors'])
    if (command.kind !== 'attach-roster' || !command.roster.built) throw new Error('expected a built roster')
    command.roster.built.limit = 1_000
    command.roster.built.strategicReserveLimit = 500
    command.roster.built.units[0]!.points = 501
    const state = reduceBattle(
      PLAYERS,
      log([ALICE, command], [BOB, roster('Death Guard')], [ALICE, { kind: 'begin-battle', firstPlayerId: ALICE }]),
    )

    expect(validate(state, ALICE, { kind: 'set-unit-formation', unitKey: 'u0', formation: 'strategic-reserves' })).toBeNull()
  })

  it('does not let a unit held in reserve at roll-off return later as an exempt redeployment', () => {
    const command = builtRoster('Ultramarines', ['Intercessors'])
    if (command.kind !== 'attach-roster' || !command.roster.built) throw new Error('expected a built roster')
    command.roster.built.strategicReserveLimit = 0
    const state = reduceBattle(
      PLAYERS,
      log(
        [ALICE, command],
        [ALICE, { kind: 'set-unit-formation', unitKey: 'u0', formation: 'strategic-reserves' }],
        [ALICE, { kind: 'set-first-turn', firstPlayerId: ALICE }],
        [ALICE, { kind: 'set-unit-formation', unitKey: 'u0', formation: 'battlefield' }],
      ),
    )

    expect(state.players[0]?.units[0]).toMatchObject({ formation: 'battlefield', deployedAtRollOff: false })
    expect(validate(state, ALICE, { kind: 'set-unit-formation', unitKey: 'u0', formation: 'strategic-reserves' })).toBe(
      'no more than 0 points of this army can start in strategic reserves',
    )
  })

  it('invalidates the roll-off history when a setup roster is replaced', () => {
    const replacement = builtRoster('Ultramarines', ['Intercessors'])
    const state = reduceBattle(
      PLAYERS,
      log(
        [ALICE, builtRoster('Ultramarines', ['Hellblasters'])],
        [ALICE, { kind: 'set-first-turn', firstPlayerId: ALICE }],
        [ALICE, replacement],
      ),
    )

    expect(state.firstPlayerId).toBeNull()
    expect(state.players[0]?.units[0]?.deployedAtRollOff).toBeUndefined()
  })

  it('refuses a deep strike formation absent from catalogue data', () => {
    const state = reduceBattle(PLAYERS, log([ALICE, builtRoster('Ultramarines', ['Intercessors'])]))

    expect(validate(state, ALICE, { kind: 'set-unit-formation', unitKey: 'u0', formation: 'deep-strike' })).toBe(
      'the roster data does not support that formation',
    )
  })

  it('holds a character and the unit they joined back together', () => {
    const state = reduceBattle(
      PLAYERS,
      log([ALICE, attachedRoster()], [ALICE, { kind: 'set-unit-formation', unitKey: 'u0', formation: 'strategic-reserves' }]),
    )

    expect(state.players[0]?.units.map((unit) => unit.formation)).toEqual(['strategic-reserves', 'strategic-reserves'])
  })

  it('puts a character and the unit they joined back on the battlefield together', () => {
    const state = reduceBattle(
      PLAYERS,
      log(
        [ALICE, attachedRoster()],
        [ALICE, { kind: 'set-unit-formation', unitKey: 'u0', formation: 'strategic-reserves' }],
        [ALICE, { kind: 'set-unit-formation', unitKey: 'u1', formation: 'battlefield' }],
      ),
    )

    expect(state.players[0]?.units.every((unit) => unit.formation === 'battlefield' && unit.deployed)).toBe(true)
  })

  it('refuses a deep strike the unit a character joined cannot make', () => {
    const state = reduceBattle(PLAYERS, log([ALICE, attachedRoster({ marines: [], lord: ['deep-strike'] })]))

    expect(validate(state, ALICE, { kind: 'set-unit-formation', unitKey: 'u1', formation: 'deep-strike' })).toBe(
      'the roster data does not support that formation',
    )
  })

  it('allows a deep strike every part of an attached unit can make', () => {
    const state = reduceBattle(PLAYERS, log([ALICE, attachedRoster({ marines: ['deep-strike'], lord: ['deep-strike'] })]))

    expect(validate(state, ALICE, { kind: 'set-unit-formation', unitKey: 'u1', formation: 'deep-strike' })).toBeNull()
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

  it('refuses to mark an already lost unit lost again', () => {
    const state = reduceBattle(
      PLAYERS,
      log(
        ...withUnits(),
        [ALICE, { kind: 'begin-battle', firstPlayerId: ALICE }],
        [ALICE, { kind: 'set-unit', unitKey: 'u0', destroyed: true }],
      ),
    )

    expect(validate(state, ALICE, { kind: 'set-unit', unitKey: 'u0', destroyed: true })).toBe('the unit is already lost')
  })
})

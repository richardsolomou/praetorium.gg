import { describe, expect, it } from 'vitest'
import { type Command, reduceBattle, validate } from './battle'
import { battleView } from './battleView'
import { battleReport } from './battleReport'
import { ALICE, BOB, CAROL, NAMES, PLAYERS, log, roster, started, turns, text } from './battle.fixtures'

describe('stratagems', () => {
  const STRAT = { key: 's1', name: 'Grenade', cp: 1, limit: 'turn' as const }
  const NEW_ORDERS = {
    key: 'new-orders',
    name: 'New Orders',
    cp: 1,
    limit: 'phase' as const,
    phases: ['command' as const],
    turn: 'your-turn' as const,
  }

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

  it('uses New Orders to discard and replace one active tactical mission atomically', () => {
    const cards = [
      { key: 'a', name: 'Behind Enemy Lines' },
      { key: 'b', name: 'Bring It Down' },
      { key: 'c', name: 'Area Denial' },
    ]
    const before = reduceBattle(
      PLAYERS,
      log(
        ...started(),
        [
          ALICE,
          {
            kind: 'set-prep',
            stratagems: [NEW_ORDERS],
            primary: null,
            secondaryMode: 'tactical',
            secondaries: [],
            secondaryDeck: cards,
          },
        ],
        [ALICE, { kind: 'draw-secondaries', secondaries: cards.slice(0, 2) }],
        [ALICE, { kind: 'acknowledge-draw' }],
      ),
    )
    const command: Command = {
      kind: 'use-new-orders',
      stratagemKey: NEW_ORDERS.key,
      secondaryKey: cards[0]!.key,
      secondary: cards[2]!,
    }

    expect(validate(before, ALICE, command)).toBeNull()
    const after = reduceBattle(
      PLAYERS,
      log(
        ...started(),
        [
          ALICE,
          {
            kind: 'set-prep',
            stratagems: [NEW_ORDERS],
            primary: null,
            secondaryMode: 'tactical',
            secondaries: [],
            secondaryDeck: cards,
          },
        ],
        [ALICE, { kind: 'draw-secondaries', secondaries: cards.slice(0, 2) }],
        [ALICE, { kind: 'acknowledge-draw' }],
        [ALICE, command],
      ),
    )

    expect(alice(after)).toMatchObject({
      cp: 0,
      cpSpent: 1,
      secondaryStatus: { a: 'discarded', b: 'active', c: 'active' },
      secondariesDrawnThisTurn: ['b', 'c'],
      secondariesToReview: ['c'],
    })
    expect(after.drawAcknowledged).toBe(false)
  })

  it('redraws a returned New Orders replacement when the discarded mission was carried into the turn', () => {
    const cards = [
      { key: 'a', name: 'Behind Enemy Lines' },
      { key: 'b', name: 'Bring It Down' },
      { key: 'c', name: 'Area Denial' },
      { key: 'd', name: 'Storm Hostile Objective' },
      { key: 'e', name: 'Defend Stronghold' },
      { key: 'f', name: 'Cull the Horde' },
    ]
    const history = log(
      ...started(),
      [
        ALICE,
        {
          kind: 'set-prep',
          stratagems: [NEW_ORDERS],
          primary: null,
          secondaryMode: 'tactical',
          secondaries: [],
          secondaryDeck: cards,
        },
      ],
      [ALICE, { kind: 'draw-secondaries', secondaries: cards.slice(0, 2) }],
      [ALICE, { kind: 'acknowledge-draw' }],
      ...turns(6, ALICE),
      ...turns(6, BOB),
      [ALICE, { kind: 'draw-secondaries', secondaries: cards.slice(2, 4) }],
      [ALICE, { kind: 'acknowledge-draw' }],
      [
        ALICE,
        {
          kind: 'use-new-orders',
          stratagemKey: NEW_ORDERS.key,
          secondaryKey: cards[0]!.key,
          secondary: cards[4]!,
        },
      ],
      [ALICE, { kind: 'set-secondary-status', key: cards[4]!.key, status: 'returned' }],
    )
    const state = reduceBattle(PLAYERS, history)

    expect(alice(state)).toMatchObject({
      additionalSecondaryDrawsThisTurn: 1,
      secondariesDrawnThisTurn: ['c', 'd'],
    })
    expect(validate(state, ALICE, { kind: 'draw-secondary', secondary: cards[5]! })).toBeNull()
  })

  it('refuses New Orders without an active tactical mission', () => {
    const card = { key: 'a', name: 'Behind Enemy Lines' }
    const state = reduceBattle(
      PLAYERS,
      log(...started(), [
        ALICE,
        {
          kind: 'set-prep',
          stratagems: [NEW_ORDERS],
          primary: null,
          secondaryMode: 'tactical',
          secondaries: [],
          secondaryDeck: [card],
        },
      ]),
    )
    const command: Command = {
      kind: 'use-new-orders',
      stratagemKey: NEW_ORDERS.key,
      secondaryKey: card.key,
      secondary: card,
    }

    expect(validate(state, ALICE, command)).toBe('choose an active secondary mission')
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

  it('allows Fire Overwatch only while the movement phase is ending', () => {
    const overwatch = {
      ...STRAT,
      name: 'Fire Overwatch',
      phases: ['movement', 'charge'] as ['movement', 'charge'],
      turn: 'opponent-turn' as const,
    }
    const prepared: [string, Command][] = [
      ...started(),
      [BOB, { kind: 'set-prep', stratagems: [overwatch], secondaries: [], primary: null, secondaryMode: 'fixed' }],
      [ALICE, { kind: 'advance' }],
    ]
    const moving = reduceBattle(PLAYERS, log(...prepared))
    const ending = reduceBattle(PLAYERS, log(...prepared, [ALICE, { kind: 'request-advance' }]))

    expect(validate(moving, ALICE, { kind: 'advance' })).toBe('offer Fire Overwatch before ending the movement phase')
    expect(validate(moving, BOB, { kind: 'use-stratagem', key: overwatch.key })).toBe(
      'Fire Overwatch is used at the end of the movement phase',
    )
    expect(validate(ending, ALICE, { kind: 'advance' })).toBeNull()
    expect(validate(ending, BOB, { kind: 'use-stratagem', key: overwatch.key })).toBeNull()
    expect(
      validate(reduceBattle(PLAYERS, log(...prepared, [ALICE, { kind: 'advance' }])), BOB, { kind: 'use-stratagem', key: overwatch.key }),
    ).toBe('Fire Overwatch is used at the end of the movement phase')
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

  const tacticalEnd = (...extra: [string, Command][]) =>
    reduceBattle(
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
            secondaries: [{ key: 'a', name: 'Behind Enemy Lines' }],
            secondaryDeck: [{ key: 'a', name: 'Behind Enemy Lines' }],
          },
        ],
        ...turns(5, ALICE),
        ...extra,
      ),
    )

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

  it('reports which mission replaces one put back into the deck', () => {
    const history = log(
      ...named(),
      [ALICE, { kind: 'set-secondary-status', key: 'a', status: 'returned' }],
      [ALICE, { kind: 'draw-secondaries', secondaries: [{ key: 'c', name: 'Area Denial' }] }],
    )

    expect(text(battleReport(NAMES, history))).toContain('Alice puts Behind Enemy Lines back in the deck and draws Area Denial')
  })

  it('discards a chosen active tactical secondary and gains one command point atomically', () => {
    const command: Command = { kind: 'resolve-tactical-hand', keys: ['a'], gainCp: true }
    const before = tacticalEnd()
    const after = tacticalEnd([ALICE, command])

    expect(validate(before, ALICE, command)).toBeNull()
    expect(alice(after)).toMatchObject({ cp: 2, cpGained: 2, secondaryStatus: { a: 'discarded' } })
    expect(text(battleReport(NAMES, log(...started(), [ALICE, command])))).toContain('Alice discards a secondary and gains 1 CP')
  })

  it('only offers the discard gain at the end of the active tactical side’s turn', () => {
    const command: Command = { kind: 'resolve-tactical-hand', keys: ['a'], gainCp: true }
    expect(validate(reduceBattle(PLAYERS, log(...started())), ALICE, command)).toBe('resolve tactical missions at the end of your turn')
    expect(validate(tacticalEnd(), BOB, command)).toBe('resolve tactical missions at the end of your turn')
  })

  it('does not grant a second additional command point in the round', () => {
    const gained = tacticalEnd([ALICE, { kind: 'adjust-cp', delta: 1 }])
    expect(validate(gained, ALICE, { kind: 'resolve-tactical-hand', keys: ['a'], gainCp: true })).toBe(
      'a side can gain at most 1 additional command point per battle round',
    )
  })

  it('discards a chosen tactical secondary without a command point when none is requested', () => {
    const command: Command = { kind: 'resolve-tactical-hand', keys: ['a'] }
    const after = tacticalEnd([ALICE, command])

    expect(validate(tacticalEnd(), ALICE, command)).toBeNull()
    expect(alice(after)?.secondaryStatus).toMatchObject({ a: 'discarded' })
    expect(alice(after)?.cp).toBe(1)
  })

  it('leaves the tactical hand untouched when nothing is chosen to discard', () => {
    const command: Command = { kind: 'resolve-tactical-hand', keys: [] }
    const after = tacticalEnd([ALICE, command])

    expect(validate(tacticalEnd(), ALICE, command)).toBeNull()
    expect(alice(after)?.secondaryStatus).toMatchObject({ a: 'active' })
  })

  it('refuses to end the turn before the tactical hand is reviewed', () => {
    expect(validate(tacticalEnd(), ALICE, { kind: 'advance' })).toBe('review the tactical hand before ending the turn')
  })

  it('refuses to grant a command point when nothing is discarded', () => {
    expect(validate(tacticalEnd(), ALICE, { kind: 'resolve-tactical-hand', keys: [], gainCp: true })).toBe(
      'discard a secondary to gain a command point',
    )
  })

  it('resolves chosen cards while granting at most one CP from the discard', () => {
    const prep: Command = {
      kind: 'set-prep',
      stratagems: [],
      primary: null,
      secondaryMode: 'tactical',
      secondaries: [
        { key: 'a', name: 'Behind Enemy Lines' },
        { key: 'b', name: 'Bring It Down' },
      ],
      secondaryDeck: [
        { key: 'a', name: 'Behind Enemy Lines' },
        { key: 'b', name: 'Bring It Down' },
        { key: 'c', name: 'Area Denial' },
        { key: 'd', name: 'Storm Hostile Objective' },
      ],
    }
    const history = log(
      ...started(),
      [ALICE, prep],
      ...turns(5, ALICE),
      [ALICE, { kind: 'resolve-tactical-hand', keys: ['a', 'b'], gainCp: true }],
      [ALICE, { kind: 'advance' }],
      ...turns(6, BOB),
    )
    const nextTurn = reduceBattle(PLAYERS, history)

    expect(alice(nextTurn)).toMatchObject({ cp: 4, secondaryStatus: { a: 'discarded', b: 'discarded' } })
    expect(validate(nextTurn, ALICE, { kind: 'draw-secondary', secondary: { key: 'c', name: 'Area Denial' } })).toBeNull()
    const oneDrawn = reduceBattle(
      PLAYERS,
      log(...history.map((entry) => [entry.by, entry.command] as [string, Command]), [
        ALICE,
        { kind: 'draw-secondary', secondary: { key: 'c', name: 'Area Denial' } },
      ]),
    )
    expect(validate(oneDrawn, ALICE, { kind: 'draw-secondary', secondary: { key: 'd', name: 'Storm Hostile Objective' } })).toBeNull()
  })

  it('draws and undoes a complete tactical refill as one action', () => {
    const cards = [
      { key: 'a', name: 'Behind Enemy Lines' },
      { key: 'b', name: 'Bring It Down' },
    ]
    const history = log(
      ...started(),
      [ALICE, { kind: 'set-prep', stratagems: [], secondaries: [], secondaryDeck: cards, primary: null, secondaryMode: 'tactical' }],
      [ALICE, { kind: 'draw-secondaries', secondaries: cards }],
    )
    const drawn = reduceBattle(PLAYERS, history)
    expect(alice(drawn)).toMatchObject({ secondaryStatus: { a: 'active', b: 'active' } })

    const undone = reduceBattle(PLAYERS, [
      ...history,
      { seq: history.length + 1, by: BOB, at: 9, command: { kind: 'undo', target: history.length } },
    ])
    expect(alice(undone)?.secondaries).toEqual([])
  })

  it('allows one card in an atomic partial-hand refill', () => {
    const cards = [
      { key: 'a', name: 'Behind Enemy Lines' },
      { key: 'b', name: 'Bring It Down' },
    ]
    const state = reduceBattle(
      PLAYERS,
      log(
        ...started(),
        [ALICE, { kind: 'set-prep', stratagems: [], secondaries: [], secondaryDeck: cards, primary: null, secondaryMode: 'tactical' }],
        [ALICE, { kind: 'draw-secondary', secondary: cards[0]! }],
      ),
    )
    expect(validate(state, ALICE, { kind: 'draw-secondaries', secondaries: [cards[1]!] })).toBeNull()
  })

  it('keeps a secret mission active when resolving the tactical hand', () => {
    const before = tacticalEnd(
      [ALICE, { kind: 'select-secret', secondary: { key: 'secret', name: 'Hold the Line' } }],
      [ALICE, { kind: 'resolve-tactical-hand', keys: ['a'] }],
    )

    expect(alice(before)?.secondaryStatus).toMatchObject({ a: 'discarded', secret: 'active' })
    expect(validate(before, ALICE, { kind: 'resolve-tactical-hand', keys: ['a'] })).toBe(
      'there are no active tactical secondaries to resolve',
    )
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

  it('let an opponent reveal a secret mission from the device refereeing the battle', () => {
    const state = reduceBattle(
      PLAYERS,
      log(...started(), [ALICE, { kind: 'select-secret', secondary: { key: 'secret-a', name: 'Hold the Line' } }]),
    )

    expect(validate(state, BOB, { kind: 'reveal-secret', playerId: ALICE })).toBeNull()
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

  it('shows the remaining tactical deck to the opponent', () => {
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

    expect(battleView({ token: 'abc' }, NAMES, state, BOB).players[0]?.remainingSecondaries).toEqual([cards[1]])
  })

  it('shows a side’s remaining tactical deck to an ally, who draws from the same hand', () => {
    const configure: Command = {
      kind: 'configure-battle',
      limit: 2000,
      missionPackId: null,
      terrainLayoutId: null,
      twistId: null,
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
    expect(ally?.remainingSecondaries).toEqual([cards[1]])
  })

  it('shows a side’s remaining tactical deck to the side it is playing against', () => {
    const cards = [
      { key: 'a', name: 'Behind Enemy Lines' },
      { key: 'b', name: 'Bring It Down' },
    ]
    const state = reduceBattle(
      PLAYERS,
      log(...started(), [
        ALICE,
        { kind: 'set-prep', stratagems: [], primary: null, secondaryMode: 'tactical', secondaries: [], secondaryDeck: cards },
      ]),
    )

    expect(battleView({ token: 'abc' }, NAMES, state, ALICE).players[0]?.remainingSecondaries).toEqual(cards)
    expect(battleView({ token: 'abc' }, NAMES, state, BOB).players[0]?.remainingSecondaries).toEqual(cards)
  })

  it('says an unrevealed secret is outstanding without naming it to the opponent', () => {
    const state = reduceBattle(
      PLAYERS,
      log(...started(), [ALICE, { kind: 'select-secret', secondary: { key: 'secret-a', name: 'Hold the Line' } }], ...turns(5, ALICE)),
    )

    for (const viewer of [ALICE, BOB]) {
      const view = battleView({ token: 'abc' }, NAMES, state, viewer)
      expect(view.advancePrompt).toBe('The active side has a secret mission to reveal or discard.')
      expect(view.secretMissionActionPlayerId).toBe(ALICE)
    }
  })

  it('offers a handoff when a hidden mission is due to score', () => {
    const award = {
      vp: 5,
      per: null,
      mode: null,
      max: null,
      group: null,
      cumulative: false,
      criteria: 'Hold the objective.',
      trigger: { timing: 'end-of-phase', phase: 'command', playerTurn: 'your-turn', roundMin: null, roundMax: null },
    }
    const state = reduceBattle(
      PLAYERS,
      log(...started(), [ALICE, { kind: 'select-secret', secondary: { key: 'secret-a', name: 'Hold the Line', awards: [award] } }]),
    )

    expect(battleView({ token: 'abc' }, NAMES, state, BOB).secretMissionActionPlayerId).toBe(ALICE)
  })

  it('offers a handoff when the upcoming side has a hidden opponent-turn settlement', () => {
    const award = {
      vp: 5,
      per: null,
      mode: null,
      max: null,
      group: null,
      cumulative: false,
      criteria: 'Hold the objective.',
      trigger: { timing: 'end-of-turn', phase: null, playerTurn: 'opponent-turn', roundMin: null, roundMax: null },
    }
    const state = reduceBattle(
      PLAYERS,
      log(
        ...started(),
        [BOB, { kind: 'select-secret', secondary: { key: 'secret-a', name: 'Hold the Line', awards: [award] } }],
        ...turns(6, ALICE),
      ),
    )

    expect(battleView({ token: 'abc' }, NAMES, state, ALICE).secretMissionActionPlayerId).toBe(BOB)
  })

  it('reveals and scores a final-round secret before completing the battle', () => {
    const secret = {
      key: 'secret-a',
      name: 'Hold the Line',
      awards: [
        {
          vp: 5,
          per: null,
          mode: null,
          max: null,
          group: null,
          cumulative: false,
          criteria: 'Hold the objective.',
          trigger: { timing: 'end-of-turn' as const, phase: null, playerTurn: 'opponent-turn' as const, roundMin: null, roundMax: null },
        },
      ],
    }
    const rounds = Array.from({ length: 5 }, () => [...turns(6, ALICE), ...turns(6, BOB)]).flat()
    const waiting = reduceBattle(PLAYERS, log(...started(), [ALICE, { kind: 'select-secret', secondary: secret }], ...rounds))
    const finished = reduceBattle(
      PLAYERS,
      log(
        ...started(),
        [ALICE, { kind: 'select-secret', secondary: secret }],
        ...rounds,
        [BOB, { kind: 'reveal-secret', playerId: ALICE }],
        [ALICE, { kind: 'score-settlement', round: 5, scores: [{ category: 'secondary', key: secret.key, delta: 5 }] }],
        [BOB, { kind: 'settle-opponent-turn' }],
      ),
    )

    expect(waiting.status).toBe('playing')
    expect(battleView({ token: 'abc' }, NAMES, waiting, BOB).secretMissionActionPlayerId).toBe(ALICE)
    expect(finished).toMatchObject({ status: 'finished', result: { reason: 'completed' } })
    expect(alice(finished)?.scored[secret.key]).toBe(5)
  })

  it('keeps a hidden owner-turn mission secret during opponent-turn settlement', () => {
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
        [BOB, { kind: 'select-secret', secondary: { key: 'secret-a', name: 'Hold the Line', awards: [award] } }],
        ...turns(6, ALICE),
      ),
    )

    expect(battleView({ token: 'abc' }, NAMES, state, ALICE).secretMissionActionPlayerId).toBeNull()
  })

  it('lets one side choose a secret mission for the side across the table', () => {
    const state = reduceBattle(PLAYERS, log(...started()))
    const command = { kind: 'select-secret', secondary: { key: 'secret-a', name: 'Hold the Line' } } as const

    expect(validate(state, BOB, { ...command, playerId: ALICE })).toBeNull()
    expect(validate(state, ALICE, command)).toBeNull()
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

  it('refuses a third secondary in the same turn', () => {
    const cards = [
      { key: 'a', name: 'Behind Enemy Lines' },
      { key: 'b', name: 'Bring It Down' },
      { key: 'c', name: 'Area Denial' },
    ]
    const state = reduceBattle(
      PLAYERS,
      log(
        ...started(),
        [ALICE, { kind: 'set-prep', stratagems: [], primary: null, secondaryMode: 'tactical', secondaries: [], secondaryDeck: cards }],
        [ALICE, { kind: 'draw-secondaries', secondaries: cards.slice(0, 2) }],
      ),
    )

    expect(validate(state, ALICE, { kind: 'draw-secondary', secondary: cards[2]! })).toBe(
      'you have already drawn your secondaries this turn',
    )
  })

  it('keeps an unresolved secondary in hand and still draws two more at the top of the next turn', () => {
    const cards = [
      { key: 'a', name: 'Behind Enemy Lines' },
      { key: 'b', name: 'Bring It Down' },
      { key: 'c', name: 'Area Denial' },
      { key: 'd', name: 'Storm Hostile Objective' },
    ]
    const state = reduceBattle(
      PLAYERS,
      log(
        ...started(),
        [ALICE, { kind: 'set-prep', stratagems: [], primary: null, secondaryMode: 'tactical', secondaries: [], secondaryDeck: cards }],
        [ALICE, { kind: 'draw-secondaries', secondaries: cards.slice(0, 2) }],
        // Neither card is scored or discarded, so a full round trip — Alice through to
        // `end`, then Bob's whole turn — should still find both waiting when Alice's
        // next turn comes owing two more regardless.
        ...turns(6, ALICE),
        ...turns(6, BOB),
      ),
    )

    expect(alice(state)?.secondaryStatus).toEqual({ a: 'active', b: 'active' })
    expect(alice(state)?.secondariesDrawnThisTurn).toEqual([])
    expect(state.round).toBe(2)
    expect(validate(state, ALICE, { kind: 'draw-secondaries', secondaries: cards.slice(2, 4) })).toBeNull()
    expect(validate(state, ALICE, { kind: 'draw-secondaries', secondaries: cards.slice(2, 3) })).toBe(
      'draw every card owed for this turn together',
    )

    const validated = reduceBattle(
      PLAYERS,
      log(
        ...started(),
        [ALICE, { kind: 'set-prep', stratagems: [], primary: null, secondaryMode: 'tactical', secondaries: [], secondaryDeck: cards }],
        [ALICE, { kind: 'draw-secondaries', secondaries: cards.slice(0, 2) }],
        ...turns(6, ALICE),
        ...turns(6, BOB),
        [ALICE, { kind: 'draw-secondaries', secondaries: cards.slice(2, 4) }],
      ),
    )
    expect(alice(validated)?.secondaries.map((secondary) => secondary.key)).toEqual(['a', 'b', 'c', 'd'])
  })

  it('puts a card back the moment it is drawn without spending one of the turn’s two draws', () => {
    const cards = [
      { key: 'a', name: 'Behind Enemy Lines' },
      { key: 'b', name: 'Bring It Down' },
      { key: 'c', name: 'Area Denial' },
    ]
    const state = reduceBattle(
      PLAYERS,
      log(
        ...started(),
        [ALICE, { kind: 'set-prep', stratagems: [], primary: null, secondaryMode: 'tactical', secondaries: [], secondaryDeck: cards }],
        [ALICE, { kind: 'draw-secondaries', secondaries: cards.slice(0, 2) }],
        [ALICE, { kind: 'set-secondary-status', key: 'b', status: 'returned' }],
      ),
    )

    // The card put back leaves the turn's tally; the one still in hand is what it dealt.
    expect(alice(state)?.secondariesDrawnThisTurn).toEqual(['a'])
    expect(validate(state, ALICE, { kind: 'draw-secondary', secondary: cards[2]! })).toBeNull()
  })

  /**
   * A hand carries what it did not score, so most turns open holding cards the turn
   * did not deal — and only what the turn dealt may go back to the deck.
   */
  it('names the cards this turn dealt apart from the ones the hand was carrying', () => {
    const cards = [
      { key: 'a', name: 'Behind Enemy Lines' },
      { key: 'b', name: 'Defend Stronghold' },
      { key: 'c', name: 'Area Denial' },
      { key: 'd', name: 'Cull the Horde' },
    ]
    const state = reduceBattle(
      PLAYERS,
      log(
        ...started(),
        [ALICE, { kind: 'set-prep', stratagems: [], primary: null, secondaryMode: 'tactical', secondaries: [], secondaryDeck: cards }],
        [ALICE, { kind: 'draw-secondaries', secondaries: cards.slice(0, 2) }],
        ...turns(6, ALICE),
        ...turns(6, BOB),
        [ALICE, { kind: 'draw-secondaries', secondaries: cards.slice(2, 4) }],
      ),
    )

    // Four in hand, two of them this turn's.
    expect(alice(state)?.secondaries.map((secondary) => secondary.key)).toEqual(['a', 'b', 'c', 'd'])
    expect(alice(state)?.secondariesDrawnThisTurn).toEqual(['c', 'd'])

    // Putting back a card carried from an earlier turn frees no draw, because it was
    // never one of this turn's two.
    const carried = reduceBattle(
      PLAYERS,
      log(
        ...started(),
        [ALICE, { kind: 'set-prep', stratagems: [], primary: null, secondaryMode: 'tactical', secondaries: [], secondaryDeck: cards }],
        [ALICE, { kind: 'draw-secondaries', secondaries: cards.slice(0, 2) }],
        ...turns(6, ALICE),
        ...turns(6, BOB),
        [ALICE, { kind: 'draw-secondaries', secondaries: cards.slice(2, 4) }],
        [ALICE, { kind: 'set-secondary-status', key: 'a', status: 'returned' }],
      ),
    )

    expect(alice(carried)?.secondariesDrawnThisTurn).toEqual(['c', 'd'])
    expect(validate(carried, ALICE, { kind: 'draw-secondary', secondary: { key: 'e', name: 'Storm Hostile Objective' } })).toBe(
      'you have already drawn your secondaries this turn',
    )
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

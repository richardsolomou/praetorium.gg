import { describe, expect, it } from 'vitest'
import { type Command, reduceBattle, validate } from './battle'
import { battleView } from './battleView'
import { battleReport } from './battleReport'
import { ALICE, BOB, CAROL, NAMES, PLAYERS, log, roster, started, turns, text } from './battle.fixtures'

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

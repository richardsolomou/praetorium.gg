import { describe, expect, it } from 'vitest'
import { type Command, reduceBattle } from './battle'
import { ALICE, BOB, log, PLAYERS, started } from './battle.fixtures'
import {
  CARD_SAMPLE,
  type CardPlay,
  type RecordBattle,
  recordFacets,
  type SeatPlay,
  STRATAGEM_ROWS,
  seatPlays,
  serviceRecord,
  type StratagemPlay,
} from './serviceRecord'

const army = (slug: string) => ({ slug, displayName: slug, icon: null })

/** A seat that did nothing with its side's resources, which is every ally's seat. */
const idle = (): SeatPlay => ({ cpSpent: 0, stratagems: [], cards: [], primary: null })

const play = (over: Partial<SeatPlay> = {}): SeatPlay => ({ ...idle(), ...over })

const used = (key: string, cp = 1): StratagemPlay => ({ key, name: key, cp })

const held = (key: string, points: number): CardPlay => ({ key, name: key, points })

/** A finished 1v1 that Alice won 55–41, going first, from the battle list's own summary. */
const duel = (over: Partial<RecordBattle> = {}): RecordBattle => ({
  status: 'finished',
  playerIds: ['alice', 'bob'],
  players: ['Alice', 'Bob'],
  sides: [0, 1],
  scores: [55, 41],
  primaries: [30, 25],
  secondaries: [25, 16],
  factions: [army('necrons'), army('death-guard')],
  detachments: [['Awakened Dynasty'], ['Plague Company']],
  firstPlayerId: 'alice',
  settings: { missionPackId: 'pariah-nexus', limit: 2000 },
  result: { concededBy: null },
  lastActivity: 10,
  plays: [idle(), idle()],
  ...over,
})

/** A 2v1 with Alice's ally beside her, the side's resources on the captain's seat as the fold keeps them. */
const allied = (over: Partial<RecordBattle> = {}): RecordBattle =>
  duel({
    playerIds: ['alice', 'ally', 'bob'],
    players: ['Alice', 'Ally', 'Bob'],
    sides: [0, 0, 1],
    scores: [55, 0, 41],
    primaries: [30, 0, 25],
    secondaries: [25, 0, 16],
    factions: [army('necrons'), army('orks'), army('death-guard')],
    detachments: [['Awakened Dynasty'], ['War Horde'], ['Plague Company']],
    plays: [play({ cpSpent: 4, stratagems: [used('grenade', 1), used('overwatch', 3)] }), idle(), play({ stratagems: [used('smoke')] })],
    ...over,
  })

/** Folds a log as the profile does, read by `viewer`. */
const folded = (viewer: string | null, ...entries: [string, Command][]) => seatPlays(reduceBattle(PLAYERS, log(...entries)), viewer)

const STRATAGEM = { key: 'grenade', name: 'Grenade', cp: 1, limit: 'unlimited' as const }

/** Alice's side with a stratagem to use and command points to use it with. */
const armed = (...more: [string, Command][]): [string, Command][] => [
  ...started(),
  [ALICE, { kind: 'set-prep', stratagems: [STRATAGEM], secondaries: [], primary: null, secondaryMode: 'fixed' }],
  [ALICE, { kind: 'adjust-cp', delta: 5 }],
  ...more,
]

/** Battles in the order they were played, so a streak has a direction. */
const sequence = (...results: ('won' | 'lost' | 'drawn')[]) =>
  results.map((result, at) =>
    duel({
      lastActivity: at + 1,
      scores: result === 'won' ? [55, 41] : result === 'lost' ? [41, 55] : [50, 50],
    }),
  )

describe('a service record', () => {
  it('counts what the battles did to the player whose record it is', () => {
    const record = serviceRecord(sequence('won', 'lost', 'drawn'), 'alice')

    expect({ battles: record.battles, won: record.won, lost: record.lost, drawn: record.drawn }).toEqual({
      battles: 3,
      won: 1,
      lost: 1,
      drawn: 1,
    })
  })

  it('reads the same battle from the other side of the table', () => {
    const record = serviceRecord([duel()], 'bob')

    expect({ won: record.won, lost: record.lost }).toEqual({ won: 0, lost: 1 })
  })

  it('leaves out a battle the player was not in', () => {
    expect(serviceRecord([duel({ playerIds: ['carol', 'dave'], players: ['Carol', 'Dave'] })], 'alice').battles).toBe(0)
  })

  it('leaves out a battle that has not finished', () => {
    expect(serviceRecord([duel({ status: 'playing' })], 'alice').battles).toBe(0)
  })

  it('separates the record by whether their own side took the first turn', () => {
    const battles = [duel(), duel({ lastActivity: 20, firstPlayerId: 'bob', scores: [41, 55] })]
    const record = serviceRecord(battles, 'alice')

    expect({ first: record.goingFirst, second: record.goingSecond }).toEqual({
      first: { battles: 1, won: 1, lost: 0, drawn: 0, rate: 1 },
      second: { battles: 1, won: 0, lost: 1, drawn: 0, rate: 0 },
    })
  })

  it('counts a battle nobody has begun into neither turn order', () => {
    const record = serviceRecord([duel({ firstPlayerId: null })], 'alice')

    expect({ battles: record.battles, first: record.goingFirst.battles, second: record.goingSecond.battles }).toEqual({
      battles: 1,
      first: 0,
      second: 0,
    })
  })

  it('averages their side points over everything, and over each kind of result', () => {
    const record = serviceRecord(sequence('won', 'lost'), 'alice')

    expect({ overall: record.averagePoints, inWins: record.averageInWins, inLosses: record.averageInLosses }).toEqual({
      overall: 48,
      inWins: 55,
      inLosses: 41,
    })
  })

  it('measures how far behind they finished in the battles they lost', () => {
    // Beaten 41-55 and 20-60: fourteen behind and forty behind.
    const record = serviceRecord([duel({ scores: [41, 55] }), duel({ lastActivity: 20, scores: [20, 60] })], 'alice')

    expect(record.lossDifferential).toBe(27)
  })

  it('splits their points into the primary and secondary halves', () => {
    const record = serviceRecord([duel()], 'alice')

    expect({ primary: record.averagePrimary, secondary: record.averageSecondary }).toEqual({ primary: 30, secondary: 25 })
  })

  it('adds an ally into the side totals rather than reading one seat', () => {
    const teamed = duel({
      playerIds: ['alice', 'ally', 'bob'],
      players: ['Alice', 'Ally', 'Bob'],
      sides: [0, 0, 1],
      scores: [55, 0, 41],
      primaries: [20, 10, 25],
      secondaries: [15, 10, 16],
      factions: [army('necrons'), army('necrons'), army('death-guard')],
      detachments: [['Awakened Dynasty'], ['Awakened Dynasty'], ['Plague Company']],
    })

    expect(serviceRecord([teamed], 'alice').averagePrimary).toBe(30)
  })

  it('gives a conceded battle to the side that stayed, whatever the points said', () => {
    const record = serviceRecord([duel({ scores: [10, 90], result: { concededBy: 'bob' } })], 'alice')

    expect(record.won).toBe(1)
  })
})

describe('win streaks', () => {
  it('counts the run still going from the most recent battle back', () => {
    expect(serviceRecord(sequence('lost', 'won', 'won'), 'alice').currentStreak).toBe(2)
  })

  it('reports no current streak when the most recent battle was not a win', () => {
    expect(serviceRecord(sequence('won', 'won', 'lost'), 'alice').currentStreak).toBe(0)
  })

  it('remembers the best run even once it has ended', () => {
    expect(serviceRecord(sequence('won', 'won', 'won', 'lost', 'won'), 'alice').longestStreak).toBe(3)
  })

  it('breaks a streak on a draw, because a streak is consecutive wins', () => {
    expect(serviceRecord(sequence('won', 'drawn', 'won'), 'alice').longestStreak).toBe(1)
  })

  it('reads the battles in the order they were played, not the order they arrived', () => {
    const [first, second, third] = sequence('lost', 'won', 'won')

    expect(serviceRecord([third, first, second].filter(Boolean) as RecordBattle[], 'alice').currentStreak).toBe(2)
  })
})

describe('narrowing a record', () => {
  it('counts only the battles the player brought that faction to', () => {
    const battles = [duel(), duel({ lastActivity: 20, factions: [army('orks'), army('death-guard')], scores: [41, 55] })]

    expect(serviceRecord(battles, 'alice', { faction: 'necrons' })).toMatchObject({ battles: 1, won: 1 })
  })

  it('counts only the battles against that faction', () => {
    const battles = [duel(), duel({ lastActivity: 20, factions: [army('necrons'), army('orks')], scores: [41, 55] })]

    expect(serviceRecord(battles, 'alice', { opponentFaction: 'orks' })).toMatchObject({ battles: 1, lost: 1 })
  })

  it('counts only the battles against that player', () => {
    const battles = [duel(), duel({ lastActivity: 20, playerIds: ['alice', 'carol'], players: ['Alice', 'Carol'], scores: [41, 55] })]

    expect(serviceRecord(battles, 'alice', { opponentId: 'carol' })).toMatchObject({ battles: 1, lost: 1 })
  })

  it('counts only the battles at that size', () => {
    const battles = [duel(), duel({ lastActivity: 20, settings: { missionPackId: 'pariah-nexus', limit: 1000 }, scores: [41, 55] })]

    expect(serviceRecord(battles, 'alice', { limit: 1000 })).toMatchObject({ battles: 1, lost: 1 })
  })

  it('counts only the battles played with that mission pack', () => {
    const battles = [duel(), duel({ lastActivity: 20, settings: { missionPackId: 'leviathan', limit: 2000 }, scores: [41, 55] })]

    expect(serviceRecord(battles, 'alice', { missionPackId: 'leviathan' })).toMatchObject({ battles: 1, lost: 1 })
  })

  it('counts only the battles their own detachment was in', () => {
    const battles = [duel(), duel({ lastActivity: 20, detachments: [['Canoptek Court'], ['Plague Company']], scores: [41, 55] })]

    expect(serviceRecord(battles, 'alice', { detachment: 'Canoptek Court' })).toMatchObject({ battles: 1, lost: 1 })
  })

  it('counts only the battles facing that detachment', () => {
    const battles = [duel(), duel({ lastActivity: 20, detachments: [['Awakened Dynasty'], ['Death Lords']], scores: [41, 55] })]

    expect(serviceRecord(battles, 'alice', { opponentDetachment: 'Death Lords' })).toMatchObject({ battles: 1, lost: 1 })
  })
})

describe('recordFacets', () => {
  it('offers the factions this player has fielded, most played first', () => {
    const battles = [duel(), duel({ lastActivity: 20 }), duel({ lastActivity: 30, factions: [army('orks'), army('death-guard')] })]

    expect(recordFacets(battles, 'alice').factions.map((facet) => [facet.value, facet.battles])).toEqual([
      ['necrons', 2],
      ['orks', 1],
    ])
  })

  it('offers the opponents they have faced rather than themselves', () => {
    expect(recordFacets([duel()], 'alice').opponents.map((facet) => facet.value)).toEqual(['bob'])
  })

  it('keeps opponent pictures with the opponent filter', () => {
    const opponents = recordFacets(
      [
        duel({
          playerDetails: [
            { id: 'alice', name: 'Alice', image: null },
            { id: 'bob', name: 'Bob', image: 'https://example.test/bob.webp' },
          ],
        }),
      ],
      'alice',
    ).opponents

    expect(opponents).toEqual([{ value: 'bob', label: 'Bob', image: 'https://example.test/bob.webp', battles: 1 }])
  })

  it('counts a 2v2 once for a faction both opponents brought', () => {
    const teamed = duel({
      playerIds: ['alice', 'ally', 'bob', 'carol'],
      players: ['Alice', 'Ally', 'Bob', 'Carol'],
      sides: [0, 0, 1, 1],
      scores: [55, 0, 41, 0],
      primaries: [30, 0, 25, 0],
      secondaries: [25, 0, 16, 0],
      factions: [army('necrons'), army('necrons'), army('orks'), army('orks')],
      detachments: [[], [], [], []],
    })

    expect(recordFacets([teamed], 'alice').opponentFactions).toEqual([{ value: 'orks', label: 'orks', battles: 1 }])
  })

  it('offers nothing for a battle whose armies were pasted in as text', () => {
    expect(recordFacets([duel({ factions: [null, null] })], 'alice').factions).toEqual([])
  })

  it('offers the battle sizes they have played, labelled for a reader', () => {
    expect(recordFacets([duel()], 'alice').limits).toEqual([{ value: '2000', label: '2000 points', battles: 1 }])
  })
})

describe('stratagems in a record', () => {
  it('counts each stratagem the side used and the command points paid for it, most used first', () => {
    const battles = [
      duel({ plays: [play({ stratagems: [used('grenade'), used('overwatch', 2), used('grenade')] }), idle()] }),
      duel({ lastActivity: 20, plays: [play({ stratagems: [used('overwatch', 1)] }), idle()] }),
    ]

    expect(serviceRecord(battles, 'alice').stratagems.map(({ key, uses, cp }) => ({ key, uses, cp }))).toEqual([
      { key: 'overwatch', uses: 2, cp: 3 },
      { key: 'grenade', uses: 2, cp: 2 },
    ])
  })

  it('leaves the opposing side’s stratagems out of the player’s', () => {
    const battles = [duel({ plays: [idle(), play({ stratagems: [used('smoke')] })] })]

    expect(serviceRecord(battles, 'alice').stratagems).toEqual([])
  })

  it('credits an ally with the stratagems their side used from the captain’s seat', () => {
    expect(serviceRecord([allied()], 'ally').stratagems.map((row) => row.key)).toEqual(['overwatch', 'grenade'])
  })

  it('credits both allies of a 2v2 with their own side’s stratagems and not the other side’s', () => {
    const doubles = duel({
      playerIds: ['alice', 'ally', 'bob', 'carol'],
      players: ['Alice', 'Ally', 'Bob', 'Carol'],
      sides: [0, 0, 1, 1],
      scores: [55, 0, 41, 0],
      factions: [army('necrons'), army('orks'), army('death-guard'), army('tau')],
      detachments: [[], [], [], []],
      plays: [play({ stratagems: [used('grenade')] }), idle(), play({ stratagems: [used('smoke')] }), idle()],
    })

    expect(
      [serviceRecord([doubles], 'ally'), serviceRecord([doubles], 'carol')].map((record) => record.stratagems.map((row) => row.key)),
    ).toEqual([['grenade'], ['smoke']])
  })

  it('lists only the most used, and says how many different ones were used', () => {
    const keys = Array.from({ length: STRATAGEM_ROWS + 2 }, (_, at) => `s${String(at).padStart(2, '0')}`)
    const record = serviceRecord([duel({ plays: [play({ stratagems: keys.map((key) => used(key)) }), idle()] })], 'alice')

    expect({ rows: record.stratagems.length, used: record.stratagemsUsed }).toEqual({ rows: STRATAGEM_ROWS, used: STRATAGEM_ROWS + 2 })
  })

  it('does not count a stratagem whose use was undone', () => {
    const plays = folded(ALICE, ...armed([ALICE, { kind: 'use-stratagem', key: 'grenade' }], [ALICE, { kind: 'undo', target: 6 }]))

    expect(serviceRecord([duel({ plays })], 'alice').stratagemsUsed).toBe(0)
  })

  it('counts what the board made a stratagem cost rather than its printed price', () => {
    const plays = folded(ALICE, ...armed([ALICE, { kind: 'use-stratagem', key: 'grenade', cp: 3 }]))

    expect(serviceRecord([duel({ plays })], 'alice').stratagems[0]).toMatchObject({ name: 'Grenade', uses: 1, cp: 3 })
  })

  it('narrows the stratagems with the rest of the record', () => {
    const battles = [
      duel({ plays: [play({ stratagems: [used('grenade')] }), idle()] }),
      duel({ lastActivity: 20, factions: [army('orks'), army('death-guard')], plays: [play({ stratagems: [used('waaagh')] }), idle()] }),
    ]

    expect(serviceRecord(battles, 'alice', { faction: 'orks' }).stratagems.map((row) => row.key)).toEqual(['waaagh'])
  })
})

describe('command points in a record', () => {
  it('averages the command points the side spent per battle, counting a battle that spent none', () => {
    const battles = [duel({ plays: [play({ cpSpent: 6 }), idle()] }), duel({ lastActivity: 20 })]

    expect(serviceRecord(battles, 'alice').averageCpSpent).toBe(3)
  })

  it('reads the spend the fold recorded, net of anything undone', () => {
    const plays = folded(
      ALICE,
      ...armed(
        [ALICE, { kind: 'use-stratagem', key: 'grenade' }],
        [ALICE, { kind: 'use-stratagem', key: 'grenade', cp: 2 }],
        [ALICE, { kind: 'undo', target: 7 }],
      ),
    )

    expect(serviceRecord([duel({ plays })], 'alice').averageCpSpent).toBe(1)
  })

  it('credits an ally with the side’s spend', () => {
    expect(serviceRecord([allied()], 'ally').averageCpSpent).toBe(4)
  })

  it('divides the side’s points by the command points it spent', () => {
    // 55 and 41 points over 4 and 6 CP: 96 over 10.
    const battles = [
      duel({ plays: [play({ cpSpent: 4 }), idle()] }),
      duel({ lastActivity: 20, scores: [41, 55], plays: [play({ cpSpent: 6 }), idle()] }),
    ]

    expect(serviceRecord(battles, 'alice').pointsPerCp).toBe(9.6)
  })

  it('has no points per command point when the side spent none', () => {
    expect(serviceRecord([duel()], 'alice').pointsPerCp).toBeNull()
  })
})

describe('secondary cards in a record', () => {
  it('counts how often each card was held, how often it scored, and what it earned per battle held', () => {
    const battles = [
      duel({ plays: [play({ cards: [held('assassination', 8), held('behind-lines', 0)] }), idle()] }),
      duel({ lastActivity: 20, plays: [play({ cards: [held('assassination', 4)] }), idle()] }),
    ]

    expect(
      serviceRecord(battles, 'alice').cards.map(({ key, held: count, scored, points, average }) => ({
        key,
        count,
        scored,
        points,
        average,
      })),
    ).toEqual([
      { key: 'assassination', count: 2, scored: 2, points: 12, average: 6 },
      { key: 'behind-lines', count: 1, scored: 0, points: 0, average: 0 },
    ])
  })

  it('credits an ally with the cards their side held', () => {
    const battle = allied({ plays: [play({ cards: [held('assassination', 5)] }), idle(), idle()] })

    expect(serviceRecord([battle], 'ally').cards.map((card) => card.key)).toEqual(['assassination'])
  })

  it('names the best and worst cards among those held often enough', () => {
    const battles = Array.from({ length: CARD_SAMPLE }, (_, at) =>
      duel({ lastActivity: at, plays: [play({ cards: [held('steady', 5), held('poor', 1)] }), idle()] }),
    )

    const record = serviceRecord(battles, 'alice')

    expect([record.bestCard?.key, record.worstCard?.key]).toEqual(['steady', 'poor'])
  })

  it('does not let a card held fewer times than the sample top the table', () => {
    const battles = [
      ...Array.from({ length: CARD_SAMPLE }, (_, at) =>
        duel({ lastActivity: at, plays: [play({ cards: [held('steady', 5), held('poor', 1)] }), idle()] }),
      ),
      duel({ lastActivity: 99, plays: [play({ cards: [held('lucky', 20)] }), idle()] }),
    ]

    expect(serviceRecord(battles, 'alice').bestCard?.key).toBe('steady')
  })

  it('names no best or worst card while fewer than two cards reach the sample', () => {
    const battles = [
      ...Array.from({ length: CARD_SAMPLE }, (_, at) => duel({ lastActivity: at, plays: [play({ cards: [held('steady', 5)] }), idle()] })),
      duel({ lastActivity: 99, plays: [play({ cards: [held('rare', 1)] }), idle()] }),
    ]

    const record = serviceRecord(battles, 'alice')

    expect([record.bestCard, record.worstCard]).toEqual([null, null])
  })

  it('narrows the cards to the battles against the faction chosen', () => {
    const battles = [
      duel({ plays: [play({ cards: [held('assassination', 8)] }), idle()] }),
      duel({ lastActivity: 20, factions: [army('necrons'), army('orks')], plays: [play({ cards: [held('behind-lines', 4)] }), idle()] }),
    ]

    expect(serviceRecord(battles, 'alice', { opponentFaction: 'orks' }).cards.map((card) => card.key)).toEqual(['behind-lines'])
  })
})

describe('secondary cards read off a folded battle', () => {
  const deck = [
    { key: 'hidden', name: 'Hidden purpose' },
    { key: 'open', name: 'Open purpose' },
  ]
  const secretly = (...more: [string, Command][]): [string, Command][] => [
    ...started(),
    [BOB, { kind: 'set-prep', stratagems: [], secondaries: [deck[1]!], secondaryDeck: deck, primary: null, secondaryMode: 'fixed' }],
    [BOB, { kind: 'select-secret', secondary: deck[0]! }],
    [BOB, { kind: 'score-secondary', key: 'hidden', delta: 6 }],
    ...more,
  ]
  const bobsCards = (viewer: string | null, entries: [string, Command][]) =>
    serviceRecord([duel({ plays: folded(viewer, ...entries) })], 'bob').cards.map((card) => card.key)

  it('leaves a face-down Secret Mission out of the record a stranger reads', () => {
    expect(bobsCards(null, secretly())).toEqual(['open'])
  })

  it('leaves a face-down Secret Mission out of the record its opponent reads', () => {
    expect(bobsCards(ALICE, secretly())).toEqual(['open'])
  })

  it('counts a face-down Secret Mission in the record its own side reads', () => {
    expect(bobsCards(BOB, secretly())).toEqual(['hidden', 'open'])
  })

  it('counts a Secret Mission once it has been revealed', () => {
    expect(bobsCards(null, secretly([BOB, { kind: 'reveal-secret' }]))).toEqual(['hidden', 'open'])
  })

  it('does not count a card put back the moment it was drawn', () => {
    const entries: [string, Command][] = [
      ...started(),
      [ALICE, { kind: 'set-prep', stratagems: [], secondaries: [], secondaryDeck: deck, primary: null, secondaryMode: 'tactical' }],
      [ALICE, { kind: 'draw-secondaries', secondaries: deck }],
      [ALICE, { kind: 'set-secondary-status', key: 'hidden', status: 'returned' }],
    ]

    expect(serviceRecord([duel({ plays: folded(ALICE, ...entries) })], 'alice').cards.map((card) => card.key)).toEqual(['open'])
  })
})

describe('primary missions in a record', () => {
  const mission = (key: string) => ({ key, name: key })

  it('counts the results and points behind each primary mission the side played', () => {
    const battles = [
      duel({ plays: [play({ primary: mission('take-and-hold') }), idle()] }),
      duel({ lastActivity: 20, scores: [41, 55], plays: [play({ primary: mission('take-and-hold') }), idle()] }),
      duel({ lastActivity: 30, plays: [play({ primary: mission('purge') }), idle()] }),
    ]

    expect(serviceRecord(battles, 'alice').primaryMissions).toEqual([
      { key: 'take-and-hold', name: 'take-and-hold', battles: 2, won: 1, lost: 1, drawn: 0, averagePoints: 48 },
      { key: 'purge', name: 'purge', battles: 1, won: 1, lost: 0, drawn: 0, averagePoints: 55 },
    ])
  })

  it('reads the mission off the side rather than the player’s own seat', () => {
    const battle = allied({ plays: [play({ primary: mission('purge') }), idle(), play({ primary: mission('hold') })] })

    expect(serviceRecord([battle], 'ally').primaryMissions.map((row) => row.key)).toEqual(['purge'])
  })

  it('counts a conceded battle as a loss under its mission whatever the points said', () => {
    const battle = duel({ result: { concededBy: 'alice' }, plays: [play({ primary: mission('purge') }), idle()] })

    expect(serviceRecord([battle], 'alice').primaryMissions[0]).toMatchObject({ won: 0, lost: 1 })
  })

  it('narrows the missions to the battle size chosen', () => {
    const battles = [
      duel({ plays: [play({ primary: mission('purge') }), idle()] }),
      duel({
        lastActivity: 20,
        settings: { missionPackId: 'pariah-nexus', limit: 1000 },
        plays: [play({ primary: mission('hold') }), idle()],
      }),
    ]

    expect(serviceRecord(battles, 'alice', { limit: 1000 }).primaryMissions.map((row) => row.key)).toEqual(['hold'])
  })
})

describe('results against each faction', () => {
  const doubles = (factions: RecordBattle['factions']) =>
    duel({
      playerIds: ['alice', 'ally', 'bob', 'carol'],
      players: ['Alice', 'Ally', 'Bob', 'Carol'],
      sides: [0, 0, 1, 1],
      scores: [55, 0, 41, 0],
      factions,
      detachments: [[], [], [], []],
    })

  it('counts the results against each army faced, most faced first', () => {
    const battles = [
      duel(),
      duel({ lastActivity: 20, scores: [41, 55] }),
      duel({ lastActivity: 30, factions: [army('necrons'), army('orks')] }),
    ]

    expect(
      serviceRecord(battles, 'alice').opposingFactions.map(({ faction, battles: count, won, lost, rate }) => [
        faction.slug,
        count,
        won,
        lost,
        rate,
      ]),
    ).toEqual([
      ['death-guard', 2, 1, 1, 0.5],
      ['orks', 1, 1, 0, 1],
    ])
  })

  it('counts a 2v2 once against a faction both opponents brought', () => {
    const battle = doubles([army('necrons'), army('necrons'), army('orks'), army('orks')])

    expect(serviceRecord([battle], 'alice').opposingFactions.map((row) => [row.faction.slug, row.battles])).toEqual([['orks', 1]])
  })

  it('narrows to the battles against the faction chosen, keeping the other army in them', () => {
    const battles = [duel({ lastActivity: 1 }), doubles([army('necrons'), army('necrons'), army('orks'), army('tau')])]

    expect(serviceRecord(battles, 'alice', { opponentFaction: 'orks' }).opposingFactions.map((row) => row.faction.slug)).toEqual([
      'orks',
      'tau',
    ])
  })

  it('counts a battle the player conceded as a loss against that army', () => {
    expect(serviceRecord([duel({ result: { concededBy: 'alice' } })], 'alice').opposingFactions[0]).toMatchObject({ won: 0, lost: 1 })
  })

  it('leaves out an opponent whose army was pasted in as text', () => {
    expect(serviceRecord([duel({ factions: [army('necrons'), null] })], 'alice').opposingFactions).toEqual([])
  })
})

describe('a record with no battles in it', () => {
  it('has nothing to list and nothing to divide', () => {
    const record = serviceRecord([], 'alice')

    expect({
      stratagems: record.stratagems,
      used: record.stratagemsUsed,
      spent: record.averageCpSpent,
      perCp: record.pointsPerCp,
      cards: record.cards,
      best: record.bestCard,
      worst: record.worstCard,
      missions: record.primaryMissions,
      factions: record.opposingFactions,
    }).toEqual({ stratagems: [], used: 0, spent: 0, perCp: null, cards: [], best: null, worst: null, missions: [], factions: [] })
  })
})

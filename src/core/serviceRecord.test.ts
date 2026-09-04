import { describe, expect, it } from 'vitest'
import { type RecordBattle, recordFacets, serviceRecord } from './serviceRecord'

const army = (slug: string) => ({ slug, displayName: slug, icon: null })

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
  ...over,
})

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

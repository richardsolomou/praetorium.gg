import { describe, expect, it } from 'vitest'
import { factionsPlayed, standings, type StandingBattle } from './standings'

/** A finished 1v1, scored the way the battle list reports one. */
const duel = (over: Partial<StandingBattle> = {}): StandingBattle => ({
  status: 'finished',
  playerIds: ['alice', 'bob'],
  players: ['Alice', 'Bob'],
  sides: [0, 1],
  scores: [55, 41],
  factions: ['necrons', 'death-guard'],
  result: { concededBy: null },
  lastActivity: 10,
  ...over,
})

describe('standings', () => {
  it('counts a finished battle for both players', () => {
    expect(standings([duel()])).toEqual([
      expect.objectContaining({ id: 'alice', battles: 1, won: 1, lost: 0, drawn: 0, points: 55, best: 55 }),
      expect.objectContaining({ id: 'bob', battles: 1, won: 0, lost: 1, drawn: 0, points: 41, best: 41 }),
    ])
  })

  it('counts nothing from a battle still being set up or played', () => {
    expect(standings([duel({ status: 'setup' }), duel({ status: 'playing' })])).toEqual([])
  })

  it('records equal scores as a draw for both', () => {
    expect(standings([duel({ scores: [50, 50] })]).map((row) => row.drawn)).toEqual([1, 1])
  })

  it('gives the battle to the side that did not concede, whatever the points said', () => {
    const [winner, loser] = standings([duel({ scores: [10, 90], result: { concededBy: 'bob' } })])

    expect({ id: winner?.id, won: winner?.won }).toEqual({ id: 'alice', won: 1 })
    expect({ id: loser?.id, lost: loser?.lost }).toEqual({ id: 'bob', lost: 1 })
  })

  it('credits an ally with their whole side, not the seat their points landed on', () => {
    const teamed = duel({
      playerIds: ['alice', 'ally', 'bob'],
      players: ['Alice', 'Ally', 'Bob'],
      sides: [0, 0, 1],
      // A side's points fold onto its first seat, so the ally's own seat holds none.
      scores: [60, 0, 45],
      factions: ['necrons', 'necrons', 'death-guard'],
    })

    expect(standings([teamed])).toEqual([
      expect.objectContaining({ id: 'alice', won: 1, points: 60 }),
      expect.objectContaining({ id: 'ally', won: 1, points: 60 }),
      expect.objectContaining({ id: 'bob', lost: 1, points: 45 }),
    ])
  })

  it('leaves out a battle a practice opponent was seated in', () => {
    const practice = duel({ playerIds: ['alice', 'practice'], players: ['Alice', 'Practice opponent'] })

    expect(standings([practice], { exclude: ['practice'] })).toEqual([])
  })

  it('adds up every battle a player appears in', () => {
    const rows = standings([duel(), duel({ scores: [30, 70], lastActivity: 20 })])

    expect(rows.find((row) => row.id === 'alice')).toEqual(
      expect.objectContaining({ battles: 2, won: 1, lost: 1, points: 85, best: 55, lastPlayed: 20 }),
    )
  })

  it('orders by wins, then the rate they came at, then the points behind them', () => {
    const rows = standings([
      duel(),
      duel({ scores: [60, 20] }),
      duel({ playerIds: ['carol', 'dave'], players: ['Carol', 'Dave'], scores: [70, 10] }),
    ])

    // Bob and Dave both won nothing, so the points they did score separate them.
    expect(rows.map((row) => row.id)).toEqual(['alice', 'carol', 'bob', 'dave'])
  })
})

describe('a faction table', () => {
  it('ranks the players who fielded it, not the faction itself', () => {
    expect(standings([duel()], { faction: 'necrons' })).toEqual([
      expect.objectContaining({ id: 'alice', name: 'Alice', battles: 1, won: 1 }),
    ])
  })

  it('counts only the battles that player brought it to', () => {
    const battles = [duel(), duel({ factions: ['orks', 'death-guard'], scores: [80, 10] })]

    expect(standings(battles, { faction: 'necrons' })).toEqual([expect.objectContaining({ id: 'alice', battles: 1, points: 55 })])
    expect(standings(battles, { faction: 'orks' })).toEqual([expect.objectContaining({ id: 'alice', battles: 1, points: 80 })])
  })

  it('puts both players in the table when they both brought it', () => {
    expect(standings([duel({ factions: ['necrons', 'necrons'] })], { faction: 'necrons' }).map((row) => row.id)).toEqual(['alice', 'bob'])
  })

  it('has no table for an army nobody built from the catalogue', () => {
    expect(standings([duel({ factions: [null, null] })], { faction: 'necrons' })).toEqual([])
  })
})

describe('factionsPlayed', () => {
  it('names every faction a finished battle was fought with, most played first', () => {
    const battles = [duel(), duel({ factions: ['death-guard', 'orks'] })]

    expect(factionsPlayed(battles)).toEqual(['death-guard', 'necrons', 'orks'])
  })

  it('leaves out a pasted list, an unfinished battle and a practice game', () => {
    const battles = [
      duel({ factions: [null, 'death-guard'] }),
      duel({ status: 'playing', factions: ['orks', 'orks'] }),
      duel({ playerIds: ['alice', 'practice'], factions: ['necrons', 'necrons'] }),
    ]

    expect(factionsPlayed(battles, ['practice'])).toEqual(['death-guard'])
  })
})

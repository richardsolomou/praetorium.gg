import { describe, expect, it } from 'vitest'
import { standings, type StandingBattle } from './standings'

/** A finished 1v1, scored the way the battle list reports one. */
const duel = (over: Partial<StandingBattle> = {}): StandingBattle => ({
  status: 'finished',
  playerIds: ['alice', 'bob'],
  players: ['Alice', 'Bob'],
  sides: [0, 1],
  scores: [55, 41],
  factions: ['ultramarines', 'death-guard'],
  detachments: [['Gladius Task Force'], ['Plague Company']],
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
    expect(standings([duel({ scores: [50, 50] })].slice()).map((row) => row.drawn)).toEqual([1, 1])
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
      // Alice beats Bob twice; Carol beats Dave once and loses nothing.
      duel(),
      duel({ scores: [60, 20] }),
      duel({ playerIds: ['carol', 'dave'], players: ['Carol', 'Dave'], scores: [70, 10] }),
    ])

    // Bob and Dave both won nothing, so the points they did score separate them.
    expect(rows.map((row) => row.id)).toEqual(['alice', 'carol', 'bob', 'dave'])
  })

  it('counts the same battle for the factions that fielded it', () => {
    const rows = standings([duel()], { subject: 'faction' })

    expect(rows).toEqual([
      expect.objectContaining({ id: 'ultramarines', won: 1, lost: 0, points: 55 }),
      expect.objectContaining({ id: 'death-guard', won: 0, lost: 1, points: 41 }),
    ])
  })

  it('leaves a pasted list out of the faction table, rather than inventing a faction for it', () => {
    const rows = standings([duel({ factions: [null, 'death-guard'] })], { subject: 'faction' })

    expect(rows.map((row) => row.id)).toEqual(['death-guard'])
  })

  it('gives one faction both results when it is on both sides', () => {
    const rows = standings([duel({ factions: ['ultramarines', 'ultramarines'] })], { subject: 'faction' })

    expect(rows).toEqual([expect.objectContaining({ id: 'ultramarines', battles: 2, won: 1, lost: 1 })])
  })

  it('counts the same battle for the detachments it was built around', () => {
    const rows = standings([duel()], { subject: 'detachment' })

    expect(rows.map((row) => ({ id: row.id, won: row.won }))).toEqual([
      { id: 'Gladius Task Force', won: 1 },
      { id: 'Plague Company', won: 0 },
    ])
  })

  it('counts a battle once for a detachment a seat named twice', () => {
    const rows = standings([duel({ detachments: [['Gladius Task Force', 'Gladius Task Force'], []] })], { subject: 'detachment' })

    expect(rows).toEqual([expect.objectContaining({ id: 'Gladius Task Force', battles: 1, won: 1 })])
  })

  it('keeps a practice battle out of every subject, not just the players', () => {
    const practice = duel({ playerIds: ['alice', 'practice'], players: ['Alice', 'Practice opponent'] })

    expect(standings([practice], { exclude: ['practice'], subject: 'faction' })).toEqual([])
    expect(standings([practice], { exclude: ['practice'], subject: 'detachment' })).toEqual([])
  })
})

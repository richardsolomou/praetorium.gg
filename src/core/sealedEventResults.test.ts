import { describe, expect, it } from 'vitest'
import { sealedEventResults } from './sealedEventResults'
import type { StandingBattle } from './standings'

const duel = (one: string, other: string, scores: [number, number], over: Partial<StandingBattle> = {}): StandingBattle => ({
  status: 'finished',
  playerIds: [one, other],
  players: [one, other],
  sides: [0, 1],
  scores,
  factions: [null, null],
  result: null,
  lastActivity: 1,
  ...over,
})

describe('sealedEventResults', () => {
  it('lists every entrant at zero before anyone has played', () => {
    expect(sealedEventResults(['a', 'b'], []).rows).toEqual([
      { userId: 'a', played: 0, won: 0, drawn: 0, lost: 0, points: 0 },
      { userId: 'b', played: 0, won: 0, drawn: 0, lost: 0, points: 0 },
    ])
  })

  it('records one finished battle for both players', () => {
    expect(sealedEventResults(['a', 'b'], [duel('a', 'b', [60, 40])]).rows).toEqual([
      { userId: 'a', played: 1, won: 1, drawn: 0, lost: 0, points: 60 },
      { userId: 'b', played: 1, won: 0, drawn: 0, lost: 1, points: 40 },
    ])
  })

  it('adds up several battles per player', () => {
    const rows = sealedEventResults(['a', 'b', 'c'], [duel('a', 'b', [60, 40]), duel('c', 'a', [50, 50]), duel('b', 'c', [70, 20])]).rows
    expect(rows.map((row) => [row.userId, row.played, row.won, row.drawn, row.lost, row.points])).toEqual([
      ['a', 2, 1, 1, 0, 110],
      ['b', 2, 1, 0, 1, 110],
      ['c', 2, 0, 1, 1, 70],
    ])
  })

  it('ranks equal records by victory points', () => {
    expect(
      sealedEventResults(['a', 'b', 'c', 'd'], [duel('a', 'b', [55, 40]), duel('c', 'd', [80, 10])]).rows.map((row) => row.userId),
    ).toEqual(['c', 'a', 'b', 'd'])
  })

  it('gives a concession to the other side whatever the score', () => {
    expect(sealedEventResults(['a', 'b'], [duel('a', 'b', [70, 10], { result: { concededBy: 'a' } })]).rows[0]?.userId).toBe('b')
  })

  it('leaves an unfinished battle out of the table', () => {
    expect(sealedEventResults(['a', 'b'], [duel('a', 'b', [60, 40], { status: 'playing' })]).rows[0]?.played).toBe(0)
  })

  it('counts an unfinished battle as a meeting', () => {
    expect(sealedEventResults(['a', 'b'], [duel('a', 'b', [0, 0], { status: 'setup' })]).met).toEqual([['a', 'b']])
  })

  it('gives allies their side’s total and no meeting with each other', () => {
    const trial: StandingBattle = {
      ...duel('solo', 'ally', [40, 20]),
      playerIds: ['solo', 'ally', 'other'],
      players: ['solo', 'ally', 'other'],
      sides: [0, 1, 1],
      scores: [40, 20, 25],
      factions: [null, null, null],
    }
    const results = sealedEventResults(['solo', 'ally', 'other'], [trial])
    expect([results.rows.find((row) => row.userId === 'ally')?.points, results.met]).toEqual([
      45,
      [
        ['ally', 'solo'],
        ['other', 'solo'],
      ],
    ])
  })

  it('ignores a seat that is not an entrant', () => {
    expect(sealedEventResults(['a'], [duel('a', 'guest', [60, 40])]).rows).toHaveLength(1)
  })
})

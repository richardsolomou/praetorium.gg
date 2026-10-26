import { describe, expect, it } from 'vitest'
import { seasonDraw, seasonFixtureStatus } from './clubSeason'

const players = (count: number) => Array.from({ length: count }, (_, index) => `p${index}`)
const pairKey = ([a, b]: [string, string | null]) => [a, b ?? 'bye'].toSorted().join('|')

describe('season draw', () => {
  it('has every pair meet exactly once', () => {
    const meetings = seasonDraw(players(6), 7).flat().map(pairKey).toSorted()
    const expected = players(6)
      .flatMap((one, index) =>
        players(6)
          .slice(index + 1)
          .map((other) => [one, other].toSorted().join('|')),
      )
      .toSorted()
    expect(meetings).toEqual(expected)
  })

  it('gives each player one bye when the count is odd', () => {
    const byes = seasonDraw(players(5), 7)
      .flat()
      .filter(([, b]) => b === null)
      .map(([a]) => a)
      .toSorted()
    expect(byes).toEqual(players(5))
  })

  it('seats nobody twice in a round', () => {
    const rounds = seasonDraw(players(7), 3)
    expect(rounds.every((round) => new Set(round.flatMap(([a, b]) => (b ? [a, b] : [a]))).size === 7)).toBe(true)
  })

  it('draws the same fixtures from the same seed and players in any order', () => {
    expect(seasonDraw(players(8).toReversed(), 42)).toEqual(seasonDraw(players(8), 42))
  })

  it('draws different fixtures from a different seed', () => {
    expect(seasonDraw(players(8), 42)).not.toEqual(seasonDraw(players(8), 43))
  })
})

describe('a withdrawn player’s fixtures', () => {
  const stillPlaying = (userId: string) => userId !== 'gone'

  it('void the ones not yet played', () => {
    expect(seasonFixtureStatus({ aId: 'gone', bId: 'b', battle: { status: 'playing' } }, stillPlaying)).toBe('void')
  })

  it('keep the ones already finished', () => {
    expect(seasonFixtureStatus({ aId: 'b', bId: 'gone', battle: { status: 'finished' } }, stillPlaying)).toBe('finished')
  })
})

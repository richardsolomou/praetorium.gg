import { describe, expect, it } from 'vitest'
import { summarySides } from './battleSummary'

describe('summarySides', () => {
  it('reads a duel as one seat against the other', () => {
    const sides = summarySides({
      players: ['Alice', 'Bob'],
      armies: ['Knights', 'Marines'],
      detachments: [['Gladius'], ['Hypercrypt']],
      scores: [42, 30],
      sides: [0, 1],
    })

    expect(sides.map((side) => [side.players, side.score])).toEqual([
      [['Alice'], 42],
      [['Bob'], 30],
    ])
  })

  /**
   * The seat an ally takes is the second one, so a row read seat by seat put a player's
   * own ally across the table from them — and took the opposing score off a seat that
   * never holds one, because a side's points fold onto its first seat.
   */
  it('keeps an ally beside the player who opened the 2v1, not across from them', () => {
    const sides = summarySides({
      players: ['Alice', 'Carol', 'Bob'],
      armies: ['Knights', 'Guard', 'Marines'],
      detachments: [['Gladius'], ['Canoptek'], ['Hypercrypt']],
      scores: [62, 0, 55],
      sides: [0, 0, 1],
    })

    expect(sides).toEqual([
      { index: 0, players: ['Alice', 'Carol'], armies: ['Knights', 'Guard'], detachments: ['Gladius', 'Canoptek'], score: 62 },
      { index: 1, players: ['Bob'], armies: ['Marines'], detachments: ['Hypercrypt'], score: 55 },
    ])
  })

  it('leaves a seat with no army out of the names its side reads by', () => {
    const sides = summarySides({
      players: ['Alice', 'Bob'],
      armies: ['Knights', null],
      detachments: [['Gladius'], []],
      scores: [0, 0],
      sides: [0, 1],
    })

    expect(sides[1]).toEqual({ index: 1, players: ['Bob'], armies: [], detachments: [], score: 0 })
  })
})

import { describe, expect, it } from 'vitest'
import { rematches, swissPairings, swissStandings, type SwissMatch } from './swiss'

const match = (round: number, a: string, b: string | null, outcome: SwissMatch['outcome'], vp: [number, number] = [0, 0]): SwissMatch => ({
  round,
  a,
  b,
  outcome,
  vp,
})
const first = () => 0

describe('swiss standings', () => {
  it('breaks a tie on match points by victory points', () => {
    const rows = swissStandings(['a', 'b', 'c', 'd'], [match(1, 'a', 'b', 'a', [60, 40]), match(1, 'c', 'd', 'a', [80, 20])])
    expect(rows.slice(0, 2).map((row) => row.userId)).toEqual(['c', 'a'])
  })

  it('breaks a tie on victory points by the strength of the schedule', () => {
    // b, z and d all won once on 50 VP; z beat someone who then won, d beat someone who never did.
    const rows = swissStandings(
      ['b', 'c', 'd', 'e', 'z'],
      [match(1, 'z', 'b', 'a', [50, 50]), match(1, 'd', 'c', 'a', [50, 50]), match(2, 'b', 'e', 'a', [0, 0])],
    )
    expect(rows.slice(0, 3).map((row) => row.userId)).toEqual(['b', 'z', 'd'])
  })

  it('counts a bye as a win without victory points', () => {
    expect(swissStandings(['a'], [match(1, 'a', null, null)])[0]).toMatchObject({ won: 1, points: 3, vp: 0 })
  })

  it('leaves an unfinished battle out of the table', () => {
    expect(swissStandings(['a', 'b'], [match(1, 'a', 'b', null)])[0]?.played).toBe(0)
  })
})

describe('swiss pairings', () => {
  it('pairs winners with winners after the first round', () => {
    const pairs = swissPairings(['a', 'b', 'c', 'd'], [match(1, 'a', 'b', 'a', [60, 40]), match(1, 'c', 'd', 'a', [55, 40])], first)
    expect(pairs).toEqual([
      ['a', 'c'],
      ['b', 'd'],
    ])
  })

  it('avoids a rematch when another pairing allows it', () => {
    const played = [
      match(1, 'a', 'b', 'a', [60, 40]),
      match(1, 'c', 'd', 'a', [55, 40]),
      match(2, 'a', 'c', 'a', [60, 40]),
      match(2, 'b', 'd', 'a'),
    ]
    expect(swissPairings(['a', 'b', 'c', 'd'], played, first)).toEqual([
      ['a', 'd'],
      ['c', 'b'],
    ])
  })

  it('gives the bye to the lowest-placed player who has not had one', () => {
    const played = [match(1, 'a', 'b', 'a', [60, 40]), match(1, 'c', null, null)]
    expect(swissPairings(['a', 'b', 'c'], played, first).find(([, opponent]) => opponent === null)?.[0]).toBe('b')
  })

  it('draws the first round at random', () => {
    expect(swissPairings(['a', 'b', 'c', 'd'], [], () => 0.99)).not.toEqual(swissPairings(['a', 'b', 'c', 'd'], [], first))
  })
})

describe('swiss rematches', () => {
  it('marks only the tables a small field forces into a second meeting', () => {
    const played: SwissMatch[] = []
    for (let round = 1; round <= 4; round++)
      for (const [a, b] of swissPairings(['a', 'b', 'c', 'd'], played, first)) played.push(match(round, a, b, 'a'))
    const tables = played.map((table) => ({ round: table.round, aId: table.a, bId: table.b }))
    expect([...rematches(tables)].map((table) => table.round)).toEqual([4, 4])
  })
})

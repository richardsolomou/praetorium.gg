import { describe, expect, it } from 'vitest'
import { seatedPlayers, seatsFor } from './seats'

describe('seatsFor', () => {
  it('asks a duel for one opponent and no ally', () => {
    expect(seatsFor('1v1').map((seat) => [seat.label, seat.side])).toEqual([['Opponent', 'theirs']])
  })

  it('seats the solo side of a 2v1 against two opponents', () => {
    expect(seatsFor('2v1', 'solo').map((seat) => [seat.label, seat.side])).toEqual([
      ['First opponent', 'theirs'],
      ['Second opponent', 'theirs'],
    ])
  })

  it('seats the paired side of a 2v1 with an ally and one opponent', () => {
    expect(seatsFor('2v1', 'pair').map((seat) => [seat.label, seat.side])).toEqual([
      ['Your ally', 'yours'],
      ['Opponent', 'theirs'],
    ])
  })

  it('ignores the role for a shape that does not seat two against one', () => {
    expect(seatsFor('2v2', 'pair')).toEqual(seatsFor('2v2', 'solo'))
  })

  it('numbers the opposing seats of a doubles table apart', () => {
    expect(
      seatsFor('2v2')
        .filter((seat) => seat.side === 'theirs')
        .map((seat) => seat.at),
    ).toEqual([0, 1])
  })
})

describe('seatedPlayers', () => {
  const filled = (ids: Record<string, string>) => (seat: { id: string }) => ids[seat.id] ?? null

  it('reads the opposing side in seat order', () => {
    const players = seatedPlayers(seatsFor('2v2'), filled({ ally: 'a', opponent: 'b', 'opponent-ally': 'c' }))
    expect(players.opponentIds).toEqual(['b', 'c'])
  })

  it('names the ally of a shape that seats one', () => {
    const players = seatedPlayers(seatsFor('2v1', 'pair'), filled({ ally: 'a', opponent: 'b' }))
    expect(players.allyId).toBe('a')
  })

  it('names no ally when the shape seats none', () => {
    const players = seatedPlayers(seatsFor('2v1', 'solo'), filled({ opponent: 'b', 'opponent-ally': 'c' }))
    expect(players.allyId).toBeNull()
  })

  it('leaves an empty seat out of the opposing side rather than sending a hole', () => {
    const players = seatedPlayers(seatsFor('2v2'), filled({ ally: 'a', 'opponent-ally': 'c' }))
    expect(players.opponentIds).toEqual(['c'])
  })
})

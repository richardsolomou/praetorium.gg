import { describe, expect, it } from 'vitest'
import { factionsPlayed, standings, type StandingBattle, winRate } from './standings'

const army = (slug: string) => ({ slug, displayName: slug, icon: null })

/** A finished 1v1, scored the way the battle list reports one. */
const duel = (over: Partial<StandingBattle> = {}): StandingBattle => ({
  status: 'finished',
  playerIds: ['alice', 'bob'],
  players: ['Alice', 'Bob'],
  sides: [0, 1],
  scores: [55, 41],
  factions: [army('necrons'), army('death-guard')],
  result: { concededBy: null },
  lastActivity: 10,
  ...over,
})

/** A duel between two named players, so a table can be built out of several. */
const between = (winner: string, loser: string, over: Partial<StandingBattle> = {}) =>
  duel({ playerIds: [winner, loser], players: [winner, loser], ...over })

describe('standings', () => {
  it('counts a finished battle for both players', () => {
    expect(standings([duel()])).toEqual([
      expect.objectContaining({ id: 'alice', battles: 1, won: 1, lost: 0, drawn: 0, net: 1, points: 55 }),
      expect.objectContaining({ id: 'bob', battles: 1, won: 0, lost: 1, drawn: 0, net: -1, points: 41 }),
    ])
  })

  it('counts nothing from a battle still being set up or played', () => {
    expect(standings([duel({ status: 'setup' }), duel({ status: 'playing' })])).toEqual([])
  })

  it('records equal scores as a draw for both', () => {
    expect(standings([duel({ scores: [50, 50] })]).map((row) => row.drawn)).toEqual([1, 1])
  })

  it('leaves a drawn battle where it found the player, neither up nor down', () => {
    expect(standings([duel({ scores: [50, 50] })]).map((row) => row.net)).toEqual([0, 0])
  })

  it('counts a draw as half a win in the rate rather than as a loss', () => {
    // Alice won one and drew one, Bob lost one and drew one.
    expect(standings([duel(), duel({ scores: [50, 50] })]).map(winRate)).toEqual([0.75, 0.25])
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
      factions: [army('necrons'), army('necrons'), army('death-guard')],
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
      expect.objectContaining({ battles: 2, won: 1, lost: 1, net: 0, points: 85, lastPlayed: 20 }),
    )
  })
})

/** Where a player finished, so a case can name two rows without the incidental opponents between them. */
const place = (rows: readonly { id: string }[], id: string) => rows.findIndex((row) => row.id === id)

describe('the order of the table', () => {
  it('puts more wins first, whatever they cost', () => {
    // Grinder is 3-2 and Steady is 2-0: more wins, though the losses paid for them.
    const rows = standings([
      between('grinder', 'a'),
      between('grinder', 'b'),
      between('grinder', 'c'),
      between('d', 'grinder'),
      between('e', 'grinder'),
      between('steady', 'f'),
      between('steady', 'g'),
    ])

    expect(place(rows, 'grinder')).toBeLessThan(place(rows, 'steady'))
  })

  it('does not put a single lucky win on top of a proven record', () => {
    const rows = standings([between('lucky', 'a'), between('proven', 'b'), between('proven', 'c')])

    expect(place(rows, 'proven')).toBeLessThan(place(rows, 'lucky'))
  })

  it('separates two players on the same wins by the rate they came at', () => {
    // Both won twice and neither lost, so only the two draws Loose needed separate
    // them — and Loose outscores Sharp, so nothing below the rate would put Sharp first.
    const rows = standings([
      between('sharp', 'a', { scores: [10, 0] }),
      between('sharp', 'b', { scores: [10, 0] }),
      between('loose', 'c', { scores: [90, 10] }),
      between('loose', 'd', { scores: [90, 10] }),
      between('loose', 'e', { scores: [50, 50] }),
      between('loose', 'f', { scores: [50, 50] }),
    ])

    expect(place(rows, 'sharp')).toBeLessThan(place(rows, 'loose'))
  })

  it('separates the same wins and the same rate by the losses behind them', () => {
    // Both are three wins at 75%: Unbeaten drew the rest, Nicked lost one. Nicked
    // scored far more doing it, so only the losses can put Unbeaten first.
    const rows = standings([
      between('unbeaten', 'a', { scores: [10, 0] }),
      between('unbeaten', 'b', { scores: [10, 0] }),
      between('unbeaten', 'c', { scores: [10, 0] }),
      between('unbeaten', 'd', { scores: [5, 5] }),
      between('unbeaten', 'e', { scores: [5, 5] }),
      between('unbeaten', 'f', { scores: [5, 5] }),
      between('nicked', 'g', { scores: [90, 10] }),
      between('nicked', 'h', { scores: [90, 10] }),
      between('nicked', 'i', { scores: [90, 10] }),
      between('j', 'nicked', { scores: [90, 10] }),
    ])

    expect(place(rows, 'unbeaten')).toBeLessThan(place(rows, 'nicked'))
  })

  it('separates equal records by the points behind them', () => {
    const rows = standings([between('wide', 'a', { scores: [90, 10] }), between('narrow', 'b', { scores: [51, 50] })])

    expect(place(rows, 'wide')).toBeLessThan(place(rows, 'narrow'))
  })
})

describe('a faction table', () => {
  it('ranks the players who fielded it, not the faction itself', () => {
    expect(standings([duel()], { faction: 'necrons' })).toEqual([
      expect.objectContaining({ id: 'alice', name: 'Alice', battles: 1, won: 1 }),
    ])
  })

  it('counts only the battles that player brought it to', () => {
    const battles = [duel(), duel({ factions: [army('orks'), army('death-guard')], scores: [80, 10] })]

    expect(standings(battles, { faction: 'necrons' })).toEqual([expect.objectContaining({ id: 'alice', battles: 1, points: 55 })])
    expect(standings(battles, { faction: 'orks' })).toEqual([expect.objectContaining({ id: 'alice', battles: 1, points: 80 })])
  })

  it('puts both players in the table when they both brought it', () => {
    expect(standings([duel({ factions: [army('necrons'), army('necrons')] })], { faction: 'necrons' }).map((row) => row.id)).toEqual([
      'alice',
      'bob',
    ])
  })

  it('has no table for an army nobody built from the catalogue', () => {
    expect(standings([duel({ factions: [null, null] })], { faction: 'necrons' })).toEqual([])
  })
})

describe('factionsPlayed', () => {
  it('names every faction a finished battle was fought with, most played first', () => {
    const battles = [duel(), duel({ factions: [army('death-guard'), army('orks')] })]

    expect(factionsPlayed(battles).map((faction) => faction.slug)).toEqual(['death-guard', 'necrons', 'orks'])
  })

  it('leaves out a pasted list, an unfinished battle and a practice game', () => {
    const battles = [
      duel({ factions: [null, army('death-guard')] }),
      duel({ status: 'playing', factions: [army('orks'), army('orks')] }),
      duel({ playerIds: ['alice', 'practice'], factions: [army('necrons'), army('necrons')] }),
    ]

    expect(factionsPlayed(battles, ['practice']).map((faction) => faction.slug)).toEqual(['death-guard'])
  })
})

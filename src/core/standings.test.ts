import { describe, expect, it } from 'vitest'
import { averagePoints, standings, type StandingBattle, winRate } from './standings'

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

/** Battles between named players, each finishing after the one before it. */
const season = (...battles: [winner: string, loser: string, over?: Partial<StandingBattle>][]) =>
  battles.map(([winner, loser, over], index) =>
    duel({ playerIds: [winner, loser], players: [winner, loser], lastActivity: index, ...over }),
  )

const overall = (battles: readonly StandingBattle[]) => standings(battles).overall

/** A player's rating in the overall table. */
const rated = (battles: readonly StandingBattle[], id: string) => overall(battles).find((row) => row.id === id)?.rating

/** Where a player finished, so a case can name two rows without the incidental opponents between them. */
const place = (rows: readonly { id: string }[], id: string) => rows.findIndex((row) => row.id === id)

describe('standings', () => {
  it('counts a finished battle for both players', () => {
    expect(overall([duel()])).toEqual([
      expect.objectContaining({ id: 'alice', battles: 1, won: 1, lost: 0, drawn: 0, points: 55 }),
      expect.objectContaining({ id: 'bob', battles: 1, won: 0, lost: 1, drawn: 0, points: 41 }),
    ])
  })

  it('keeps each player picture with their standing', () => {
    const rows = overall([
      duel({
        playerDetails: [
          { id: 'alice', name: 'Alice', image: 'https://example.test/alice.webp' },
          { id: 'bob', name: 'Bob', image: null },
        ],
      }),
    ])

    expect(rows.map(({ name, image }) => ({ name, image }))).toEqual([
      { name: 'Alice', image: 'https://example.test/alice.webp' },
      { name: 'Bob', image: null },
    ])
  })

  it('counts nothing from a battle still being set up or played', () => {
    expect(overall([duel({ status: 'setup' }), duel({ status: 'playing' })])).toEqual([])
  })

  it('records equal scores as a draw for both', () => {
    expect(overall([duel({ scores: [50, 50] })]).map((row) => row.drawn)).toEqual([1, 1])
  })

  it('counts a draw as half a win in the rate rather than as a loss', () => {
    // Alice won one and drew one, Bob lost one and drew one.
    expect(overall([duel(), duel({ scores: [50, 50] })]).map(winRate)).toEqual([0.75, 0.25])
  })

  it('averages victory points over the battles played', () => {
    const alice = overall([duel(), duel({ scores: [30, 70] })]).find((row) => row.id === 'alice')!

    expect(averagePoints(alice)).toBe(42.5)
  })

  it('averages nothing for a player with no battles', () => {
    expect(averagePoints({ points: 0, battles: 0 })).toBe(0)
  })

  it('gives the battle to the side that did not concede, whatever the points said', () => {
    const [winner, loser] = overall([duel({ scores: [10, 90], result: { concededBy: 'bob' } })])

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

    expect(overall([teamed])).toEqual([
      expect.objectContaining({ id: 'alice', won: 1, points: 60 }),
      expect.objectContaining({ id: 'ally', won: 1, points: 60 }),
      expect.objectContaining({ id: 'bob', lost: 1, points: 45 }),
    ])
  })

  it('leaves out a battle a practice opponent was seated in', () => {
    const practice = duel({ playerIds: ['alice', 'practice'], players: ['Alice', 'Practice opponent'] })

    expect(standings([practice], { exclude: ['practice'] })).toEqual({ overall: [], factions: [] })
  })

  it('adds up every battle a player appears in', () => {
    const rows = overall([duel(), duel({ scores: [30, 70], lastActivity: 20 })])

    expect(rows.find((row) => row.id === 'alice')).toEqual(
      expect.objectContaining({ battles: 2, won: 1, lost: 1, points: 85, lastPlayed: 20 }),
    )
  })
})

describe('the rating', () => {
  it('lifts the winner of a first battle above a newcomer and drops the loser below', () => {
    expect(overall([duel()]).map((row) => Math.sign(row.rating - 1000))).toEqual([1, -1])
  })

  it('moves both players of a drawn battle alike', () => {
    const [one, other] = overall([duel({ scores: [50, 50] })])

    expect(one?.rating).toBe(other?.rating)
  })

  it('counts beating a proven player for more than beating a newcomer', () => {
    const battles = season(['proven', 'a'], ['proven', 'b'], ['proven', 'c'], ['giant', 'proven'], ['minnow', 'd'])

    expect(rated(battles, 'giant')).toBeGreaterThan(rated(battles, 'minnow')!)
  })

  it('counts beating the same friend again for less than beating somebody new', () => {
    const battles = season(
      ...Array.from({ length: 5 }, () => ['farmer', 'friend'] as [string, string]),
      ...['p', 'q', 'r', 's', 't'].map((opponent) => ['spread', opponent] as [string, string]),
    )

    expect(rated(battles, 'spread')).toBeGreaterThan(rated(battles, 'farmer')!)
  })

  it('puts a clean record above more wins bought with losses', () => {
    // Grinder is 3-2 and Steady is 2-0 against the same kind of opposition.
    const rows = overall(
      season(['grinder', 'a'], ['grinder', 'b'], ['grinder', 'c'], ['d', 'grinder'], ['e', 'grinder'], ['steady', 'f'], ['steady', 'g']),
    )

    expect(place(rows, 'steady')).toBeLessThan(place(rows, 'grinder'))
  })

  it('does not put a single lucky win on top of a proven record', () => {
    const rows = overall(season(['lucky', 'a'], ['proven', 'b'], ['proven', 'c']))

    expect(place(rows, 'proven')).toBeLessThan(place(rows, 'lucky'))
  })

  it('rates battles in the order they finished, whatever order they arrive in', () => {
    const battles = season(['proven', 'a'], ['proven', 'b'], ['giant', 'proven'])

    expect(overall(battles.toReversed())).toEqual(overall(battles))
  })

  it.each([
    ['2v2', { playerIds: ['alice', 'ally', 'bob', 'bert'], sides: [0, 0, 1, 1], scores: [60, 0, 45, 0] }],
    ['2v1', { playerIds: ['alice', 'ally', 'bob'], sides: [0, 0, 1], scores: [60, 0, 45] }],
  ] satisfies [string, Partial<StandingBattle>][])('rates allies in a %s as one side', (_, over) => {
    const battles = [duel({ ...over, players: over.playerIds, factions: over.playerIds.map(() => null) })]

    expect(rated(battles, 'ally')).toBe(rated(battles, 'alice'))
  })

  it('separates equal ratings by the points a battle behind them', () => {
    const rows = overall(season(['wide', 'a', { scores: [90, 10] }], ['narrow', 'b', { scores: [51, 50] }]))

    expect(place(rows, 'wide')).toBeLessThan(place(rows, 'narrow'))
  })
})

describe('a faction table', () => {
  const table = (battles: readonly StandingBattle[], slug: string) =>
    standings(battles).factions.find((entry) => entry.faction.slug === slug)?.rows

  it('ranks the players who fielded it, not the faction itself', () => {
    expect(table([duel()], 'necrons')).toEqual([expect.objectContaining({ id: 'alice', name: 'Alice', battles: 1, won: 1 })])
  })

  it('counts only the battles that player brought it to', () => {
    const battles = [duel(), duel({ factions: [army('orks'), army('death-guard')], scores: [80, 10] })]

    expect(table(battles, 'necrons')).toEqual([expect.objectContaining({ id: 'alice', battles: 1, points: 55 })])
    expect(table(battles, 'orks')).toEqual([expect.objectContaining({ id: 'alice', battles: 1, points: 80 })])
  })

  it('rates a player with the faction apart from their overall rating', () => {
    // Alice lost with Tau before she won with Necrons, so her overall rating carries the loss.
    const battles = season(['bob', 'alice', { factions: [army('orks'), army('tau')] }], ['alice', 'bob'])

    expect(table(battles, 'necrons')?.[0]?.rating).toBeGreaterThan(rated(battles, 'alice')!)
  })

  it('measures a faction win against the opponent’s overall rating', () => {
    // Both are one win from one battle with Necrons, but only Zed's came against a
    // player proven with another army; a tie would put Carol first by name.
    const orks = { factions: [army('orks'), army('death-guard')] }
    const battles = season(['bob', 'a', orks], ['bob', 'b', orks], ['zed', 'bob'], ['carol', 'c'])
    const rows = table(battles, 'necrons')!

    expect(place(rows, 'zed')).toBeLessThan(place(rows, 'carol'))
  })

  it('puts both players in the table when they both brought it', () => {
    expect(table([duel({ factions: [army('necrons'), army('necrons')] })], 'necrons')?.map((row) => row.id)).toEqual(['alice', 'bob'])
  })

  it('has no table for an army nobody built from the catalogue', () => {
    expect(standings([duel({ factions: [null, null] })]).factions).toEqual([])
  })

  it('orders the tables by how often each faction was fielded', () => {
    const battles = [duel(), duel({ factions: [army('death-guard'), army('orks')] })]

    expect(standings(battles).factions.map((entry) => entry.faction.slug)).toEqual(['death-guard', 'necrons', 'orks'])
  })

  it('has no table from a pasted list, an unfinished battle or a practice game', () => {
    const battles = [
      duel({ factions: [null, army('death-guard')] }),
      duel({ status: 'playing', factions: [army('orks'), army('orks')] }),
      duel({ playerIds: ['alice', 'practice'], factions: [army('necrons'), army('necrons')] }),
    ]

    expect(standings(battles, { exclude: ['practice'] }).factions.map((entry) => entry.faction.slug)).toEqual(['death-guard'])
  })
})

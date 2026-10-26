import { shuffle } from './swiss'

/**
 * A club season: one round robin of one-on-one games among the members who joined it before it was published. Results
 * score as Swiss does, so `swissStandings` ranks the table.
 */

export const CLUB_SEASON_PLAYERS_MIN = 3
/** Keeps every fixture's battle within one page of the battle feed: 32 players play 496 games. */
export const CLUB_SEASON_PLAYERS_MAX = 32

/** A draw's seed: any unsigned 32-bit integer. */
export const CLUB_SEASON_SEED_MAX = 0xffff_ffff

/**
 * Every round's tables, by the circle method over the players in an order the seed shuffles. Each pair meets once;
 * with an odd number, one player per round has a bye, which is listed last. The players' order does not matter.
 */
export function seasonDraw(players: readonly string[], seed: number): [string, string | null][][] {
  const order: (string | null)[] = shuffle(players.toSorted(), seededRandom(seed))
  if (order.length % 2) order.push(null)
  const rounds: [string, string | null][][] = []
  for (let round = 1; round < order.length; round++) {
    const tables: [string, string | null][] = []
    let bye: string | null = null
    for (let index = 0; index < order.length / 2; index++) {
      const one = order[index]!
      const other = order[order.length - 1 - index]!
      if (one === null || other === null) bye = one ?? other
      else tables.push([one, other])
    }
    rounds.push(bye === null ? tables : [...tables, [bye, null]])
    // The first place stays put while everyone else moves one seat round.
    order.splice(1, 0, order.pop()!)
  }
  return rounds
}

/** Mulberry32: a small generator whose sequence the seed alone decides. */
function seededRandom(seed: number) {
  let state = seed | 0
  return () => {
    state = (state + 0x6d2b79f5) | 0
    let value = Math.imul(state ^ (state >>> 15), state | 1)
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61)
    return ((value ^ (value >>> 14)) >>> 0) / 2 ** 32
  }
}

export type SeasonFixtureStatus = 'bye' | 'void' | 'open' | 'playing' | 'finished'

/**
 * Where a fixture stands. A finished battle always counts. Otherwise a fixture with a player who has left the season is
 * void, a bye included, and nobody plays it.
 */
export function seasonFixtureStatus(
  fixture: { aId: string; bId: string | null; battle: { status: 'setup' | 'playing' | 'finished' } | null },
  stillPlaying: (userId: string) => boolean,
): SeasonFixtureStatus {
  if (fixture.battle?.status === 'finished') return 'finished'
  if (!stillPlaying(fixture.aId) || (fixture.bId !== null && !stillPlaying(fixture.bId))) return 'void'
  if (fixture.bId === null) return 'bye'
  return fixture.battle ? 'playing' : 'open'
}

/** A game still to finish once its round's deadline has passed. */
export function seasonFixtureOverdue(status: SeasonFixtureStatus, deadline: number | null, now: number) {
  return deadline !== null && now >= deadline && (status === 'open' || status === 'playing')
}

/**
 * Swiss rounds for a one-on-one tournament: who plays whom each round, and who leads.
 *
 * A win is worth 3 match points and a draw 1; a bye counts as a win with no victory points. Ties break on total
 * victory points, then strength of schedule: the match points of everyone a player has faced.
 */

/** One table of one round. `b` is null for a bye; `outcome` is null until the battle finishes. */
export type SwissMatch = {
  round: number
  a: string
  b: string | null
  outcome: 'a' | 'b' | 'draw' | null
  vp: readonly [number, number]
}

export type SwissRow = {
  userId: string
  played: number
  won: number
  drawn: number
  lost: number
  points: number
  vp: number
  /** Match points of every opponent faced, the second tiebreak. */
  schedule: number
}

/** More rounds than this would outlast any event a group runs in a day or a weekend. */
export const SWISS_ROUNDS_MAX = 12
const SWISS_WIN = 3
const SWISS_DRAW = 1

export function swissStandings(players: readonly string[], matches: readonly SwissMatch[]): SwissRow[] {
  const rows = new Map(
    players.map((userId): [string, SwissRow] => [userId, { userId, played: 0, won: 0, drawn: 0, lost: 0, points: 0, vp: 0, schedule: 0 }]),
  )
  const opponents = new Map<string, string[]>()
  for (const match of matches) {
    if (match.b === null) {
      const row = rows.get(match.a)
      if (row) {
        row.won += 1
        row.points += SWISS_WIN
      }
      continue
    }
    if (match.outcome === null) continue
    for (const [side, userId, opponentId] of [
      ['a', match.a, match.b],
      ['b', match.b, match.a],
    ] as const) {
      const row = rows.get(userId)
      if (!row) continue
      row.played += 1
      row.vp += side === 'a' ? match.vp[0] : match.vp[1]
      if (match.outcome === 'draw') {
        row.drawn += 1
        row.points += SWISS_DRAW
      } else if (match.outcome === side) {
        row.won += 1
        row.points += SWISS_WIN
      } else row.lost += 1
      opponents.set(userId, [...(opponents.get(userId) ?? []), opponentId])
    }
  }
  for (const row of rows.values())
    row.schedule = (opponents.get(row.userId) ?? []).reduce((sum, id) => sum + (rows.get(id)?.points ?? 0), 0)
  return [...rows.values()].toSorted(
    (one, other) =>
      other.points - one.points || other.vp - one.vp || other.schedule - one.schedule || one.userId.localeCompare(other.userId),
  )
}

/** Every pair that has already met, as a key either order of the two reads the same. */
const pairKey = (one: string, other: string) => (one < other ? `${one}|${other}` : `${other}|${one}`)

/**
 * The next round's tables. The first round is drawn at random; after it, players meet others on the same score,
 * top of the standings first, never someone they have already played when any other pairing allows it. With an odd
 * number, the lowest-placed player who has not had a bye sits this round out.
 */
export function swissPairings(players: readonly string[], matches: readonly SwissMatch[], random: () => number): [string, string | null][] {
  const round = Math.max(0, ...matches.map((match) => match.round)) + 1
  const order =
    round === 1
      ? shuffle(players, random)
      : swissStandings(players, matches)
          .map((row) => row.userId)
          .filter((id) => players.includes(id))
  const byes = new Set(matches.filter((match) => match.b === null).map((match) => match.a))
  let bye: string | null = null
  if (order.length % 2) {
    bye = order.findLast((id) => !byes.has(id)) ?? order.at(-1)!
    order.splice(order.indexOf(bye), 1)
  }
  const met = new Set(matches.flatMap((match) => (match.b === null ? [] : [pairKey(match.a, match.b)])))
  const pairs = pairWithoutRematches(order, met) ?? adjacentPairs(order)
  return [...pairs, ...(bye ? [[bye, null] as [string, null]] : [])]
}

/** Pairs down the standings, backing up a step whenever the only opponent left is a rematch. */
function pairWithoutRematches(order: readonly string[], met: ReadonlySet<string>): [string, string][] | null {
  const [first, ...rest] = order
  if (first === undefined) return []
  for (const opponent of rest) {
    if (met.has(pairKey(first, opponent))) continue
    const tail = pairWithoutRematches(
      rest.filter((id) => id !== opponent),
      met,
    )
    if (tail) return [[first, opponent], ...tail]
  }
  return null
}

function adjacentPairs(order: readonly string[]): [string, string][] {
  return Array.from({ length: order.length / 2 }, (_, index) => [order[index * 2]!, order[index * 2 + 1]!])
}

function shuffle<T>(items: readonly T[], random: () => number) {
  const shuffled = [...items]
  for (let index = shuffled.length - 1; index > 0; index--) {
    const other = Math.floor(random() * (index + 1))
    ;[shuffled[index], shuffled[other]] = [shuffled[other]!, shuffled[index]!]
  }
  return shuffled
}

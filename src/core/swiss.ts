/**
 * Swiss rounds for a one-on-one tournament: who plays whom each round, and who leads.
 *
 * A win is worth 3 match points and a draw 1; a bye counts as a win with no victory points. Ties break on total
 * victory points, then strength of schedule: the match points of everyone a player has faced.
 *
 * A dropped player is never paired again and keeps their results. Their unfinished table goes to the opponent as a bye.
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

export function swissStandings(
  players: readonly string[],
  matches: readonly SwissMatch[],
  dropped: ReadonlySet<string> = new Set(),
): SwissRow[] {
  const rows = new Map(
    players.map((userId): [string, SwissRow] => [userId, { userId, played: 0, won: 0, drawn: 0, lost: 0, points: 0, vp: 0, schedule: 0 }]),
  )
  const opponents = new Map<string, string[]>()
  for (const match of withForfeits(matches, dropped)) {
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

/** Turns an unfinished table one side dropped out of into a bye for the other; one both left counts for neither. */
function withForfeits(matches: readonly SwissMatch[], dropped: ReadonlySet<string>): SwissMatch[] {
  return matches.map((match) => {
    if (match.b === null || match.outcome !== null || dropped.has(match.a) === dropped.has(match.b)) return match
    return { ...match, a: dropped.has(match.a) ? match.b : match.a, b: null, vp: [0, 0] }
  })
}

/** Every pair that has already met, as a key either order of the two reads the same. */
const pairKey = (one: string, other: string) => (one < other ? `${one}|${other}` : `${other}|${one}`)

/**
 * The next round's tables. The first round is drawn at random; after it, players meet others on the same score,
 * top of the standings first, never someone they have already played when any other pairing allows it, and as few
 * rematches as possible when none does. With an odd number, the lowest-placed player who has not had a bye sits this
 * round out. `players` includes dropped players, whose results still count toward their opponents' schedules.
 */
export function swissPairings(
  players: readonly string[],
  matches: readonly SwissMatch[],
  random: () => number,
  dropped: ReadonlySet<string> = new Set(),
): [string, string | null][] {
  const round = Math.max(0, ...matches.map((match) => match.round)) + 1
  const order = (
    round === 1
      ? shuffle(players, random)
      : swissStandings(players, matches, dropped)
          .map((row) => row.userId)
          .filter((id) => players.includes(id))
  ).filter((id) => !dropped.has(id))
  const byes = new Set(
    withForfeits(matches, dropped)
      .filter((match) => match.b === null)
      .map((match) => match.a),
  )
  let bye: string | null = null
  if (order.length % 2) {
    bye = order.findLast((id) => !byes.has(id)) ?? order.at(-1)!
    order.splice(order.indexOf(bye), 1)
  }
  const met = new Set(matches.flatMap((match) => (match.b === null ? [] : [pairKey(match.a, match.b)])))
  let pairs: [string, string][] | null = null
  for (let allowed = 0; !pairs; allowed++) pairs = pairWithRematches(order, met, allowed)
  return [...pairs, ...(bye ? [[bye, null] as [string, null]] : [])]
}

/** The tables whose two players met in an earlier round, which a small field forces once every fresh pairing is used up. */
export function rematches<T extends { round: number; aId: string; bId: string | null }>(pairings: readonly T[]): Set<T> {
  const firstMet = new Map<string, number>()
  for (const pairing of pairings) {
    if (pairing.bId === null) continue
    const key = pairKey(pairing.aId, pairing.bId)
    firstMet.set(key, Math.min(firstMet.get(key) ?? pairing.round, pairing.round))
  }
  return new Set(pairings.filter((pairing) => pairing.bId !== null && firstMet.get(pairKey(pairing.aId, pairing.bId))! < pairing.round))
}

/**
 * Whether a finished table's players may no longer reopen or undo its result: a later round was paired on it, so only
 * the tournament's organizers may correct it. Correcting it changes the standings, never a round already paired.
 */
export function swissResultLocked(table: { isOrganizer: boolean; battleRound: number; latestPairedRound: number }) {
  return !table.isOrganizer && table.battleRound < table.latestPairedRound
}

/** Pairs down the standings with at most `allowed` repeat tables, backing up a step whenever the rest cannot fit. */
function pairWithRematches(order: readonly string[], met: ReadonlySet<string>, allowed: number): [string, string][] | null {
  const [first, ...rest] = order
  if (first === undefined) return []
  for (const opponent of rest) {
    const left = allowed - Number(met.has(pairKey(first, opponent)))
    if (left < 0) continue
    const tail = pairWithRematches(
      rest.filter((id) => id !== opponent),
      met,
      left,
    )
    if (tail) return [[first, opponent], ...tail]
  }
  return null
}

export function shuffle<T>(items: readonly T[], random: () => number) {
  const shuffled = [...items]
  for (let index = shuffled.length - 1; index > 0; index--) {
    const other = Math.floor(random() * (index + 1))
    ;[shuffled[index], shuffled[other]] = [shuffled[other]!, shuffled[index]!]
  }
  return shuffled
}

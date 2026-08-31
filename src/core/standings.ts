/**
 * Tables of who is winning, folded from finished battles.
 *
 * Nothing here is stored. A standing is the same kind of value as a score: a
 * second copy of it in a column would be free to disagree with the logs it came
 * from, and a win is not a fact anybody records — it is what the two sides'
 * points say once the battle is over. So this takes the battles as they were
 * already folded for the battle list and counts them.
 *
 * The same count answers more than one question. A battle is a player's result,
 * but it is also a result for the faction that fielded the army and for the
 * detachment it was built around, and a young instance with a handful of games
 * has more to show if it can say all three. Which of them a row stands for is the
 * `subject`; everything after that is identical, which is why it is one fold with
 * a different key rather than three tables that could drift apart.
 */
export const STANDING_SUBJECTS = ['player', 'faction', 'detachment'] as const

export type StandingSubject = (typeof STANDING_SUBJECTS)[number]

/** One finished battle, as the battle list already summarizes it. */
export type StandingBattle = {
  status: 'setup' | 'playing' | 'finished'
  playerIds: readonly string[]
  players: readonly string[]
  sides: readonly number[]
  scores: readonly number[]
  /** The catalogue each seat's army came from, when it was built from one. */
  factions: readonly (string | null)[]
  detachments: readonly (readonly string[])[]
  result: { concededBy: string | null } | null
  lastActivity: number
}

export type Standing = {
  id: string
  name: string
  battles: number
  won: number
  lost: number
  drawn: number
  /** Victory points the side finished on, added up across their battles. */
  points: number
  /** The largest score one of those sides finished on. */
  best: number
  lastPlayed: number
}

/**
 * What one battle did to the people in it.
 *
 * A side is one score, so an ally of a 2v1 is credited with the side's total
 * rather than the part of it that happens to sit on their seat — the whole point
 * of allies is that the resources and the scoring are shared. A concession is
 * decided before the points are: a player who gives up has lost the battle
 * whatever the board said when they did.
 */
function outcome(battle: StandingBattle, side: number): 'won' | 'lost' | 'drawn' {
  const conceded = battle.result?.concededBy
  if (conceded) {
    const concededSide = battle.sides[battle.playerIds.indexOf(conceded)]
    if (concededSide !== undefined) return concededSide === side ? 'lost' : 'won'
  }
  const ours = sideScore(battle, side)
  const theirs = Math.max(
    ...battle.sides.filter((other) => other !== side).map((other) => sideScore(battle, other)),
    Number.NEGATIVE_INFINITY,
  )
  if (theirs === Number.NEGATIVE_INFINITY) return 'drawn'
  if (ours > theirs) return 'won'
  return ours < theirs ? 'lost' : 'drawn'
}

function sideScore(battle: StandingBattle, side: number) {
  return battle.sides.reduce((total, seat, index) => (seat === side ? total + (battle.scores[index] ?? 0) : total), 0)
}

/**
 * What one seat contributes a row for.
 *
 * A seat is exactly one player, so a player row is one entry. It is at most one
 * faction, and none at all when the list was pasted as text rather than built
 * from the catalogue — an unknown faction is left out rather than bundled into a
 * row for everything nobody could identify. It can be more than one detachment,
 * and each of them played the battle, so each is credited with it.
 */
function entrants(battle: StandingBattle, seat: number, subject: StandingSubject): { id: string; name: string }[] {
  if (subject === 'player') {
    const id = battle.playerIds[seat]
    return id ? [{ id, name: battle.players[seat] ?? 'Unknown player' }] : []
  }
  if (subject === 'faction') {
    const id = battle.factions[seat]
    return id ? [{ id, name: id }] : []
  }
  return [...new Set(battle.detachments[seat] ?? [])].map((name) => ({ id: name, name }))
}

/**
 * The standings for a set of battles, best first.
 *
 * `exclude` names accounts that are not players — the practice opponents an
 * instance seats. A battle with one of them in it is left out altogether rather
 * than counted for the human across the table: beating a seat nobody is sitting
 * in is not a result, and a table of who has beaten it most is not a leaderboard.
 * That holds for every subject, so a faction is not padded out by the games it
 * was fielded against nobody either.
 */
export function standings(
  battles: readonly StandingBattle[],
  { exclude = [], subject = 'player' }: { exclude?: readonly string[]; subject?: StandingSubject } = {},
): Standing[] {
  const excluded = new Set(exclude)
  const table = new Map<string, Standing>()
  for (const battle of battles) {
    if (battle.status !== 'finished') continue
    if (battle.playerIds.some((id) => excluded.has(id))) continue
    battle.sides.forEach((side, seat) => {
      const score = sideScore(battle, side)
      const settled = outcome(battle, side)
      for (const entrant of entrants(battle, seat, subject)) {
        const row = table.get(entrant.id) ?? {
          ...entrant,
          battles: 0,
          won: 0,
          lost: 0,
          drawn: 0,
          points: 0,
          best: 0,
          lastPlayed: 0,
        }
        row.battles += 1
        row[settled] += 1
        row.points += score
        row.best = Math.max(row.best, score)
        row.lastPlayed = Math.max(row.lastPlayed, battle.lastActivity)
        table.set(entrant.id, row)
      }
    })
  }
  return [...table.values()].sort(compareStandings)
}

/**
 * The order the table is read in: wins first, then the rate they came at, then
 * the points behind them. Every tie is broken by something, ending in the name,
 * so two instances holding the same battles print the same table.
 */
export function compareStandings(one: Standing, other: Standing): number {
  return (
    other.won - one.won ||
    winRate(other) - winRate(one) ||
    other.points - one.points ||
    other.battles - one.battles ||
    one.name.localeCompare(other.name)
  )
}

/** Wins as a share of battles played, counting a draw as neither. */
export function winRate(standing: Standing): number {
  return standing.battles ? standing.won / standing.battles : 0
}

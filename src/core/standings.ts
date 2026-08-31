/**
 * A table of players, counted from finished battles.
 *
 * Nothing here is stored. A standing is the same kind of value as a score: a
 * second copy of it in a column would be free to disagree with the logs it came
 * from, and a win is not a fact anybody records — it is what the two sides'
 * points say once the battle is over. So this takes the battles as they were
 * already folded for the battle list and counts them.
 *
 * A row is always a player. `faction` narrows which of their battles count, so
 * the same code answers "who wins most" and "who is the best Necrons player"
 * rather than a second table that could disagree with the first.
 */

/** One finished battle, as the battle list already summarizes it. */
export type StandingBattle = {
  status: 'setup' | 'playing' | 'finished'
  playerIds: readonly string[]
  players: readonly string[]
  sides: readonly number[]
  scores: readonly number[]
  /** The catalogue each seat's army came from, when it was built from one. */
  factions: readonly (string | null)[]
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
  /** Victory points the player's side finished on, added up across their battles. */
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
 * Which battles this table is allowed to count.
 *
 * `exclude` names accounts that are not players — the practice opponents an
 * instance seats. A battle with one of them in it is left out altogether rather
 * than counted for the human across the table: beating a seat nobody is sitting
 * in is not a result, and a table of who has beaten it most is not a leaderboard.
 */
function counted(battles: readonly StandingBattle[], exclude: readonly string[]) {
  const excluded = new Set(exclude)
  return battles.filter((battle) => battle.status === 'finished' && !battle.playerIds.some((id) => excluded.has(id)))
}

export function standings(
  battles: readonly StandingBattle[],
  { exclude = [], faction }: { exclude?: readonly string[]; faction?: string } = {},
): Standing[] {
  const table = new Map<string, Standing>()
  for (const battle of counted(battles, exclude)) {
    battle.sides.forEach((side, seat) => {
      const id = battle.playerIds[seat]
      // A faction table counts the battles this player fielded it in, not every
      // battle they played while somebody else brought it.
      if (!id || (faction !== undefined && battle.factions[seat] !== faction)) return
      const row = table.get(id) ?? {
        id,
        name: battle.players[seat] ?? 'Unknown player',
        battles: 0,
        won: 0,
        lost: 0,
        drawn: 0,
        points: 0,
        best: 0,
        lastPlayed: 0,
      }
      const score = sideScore(battle, side)
      row.battles += 1
      row[outcome(battle, side)] += 1
      row.points += score
      row.best = Math.max(row.best, score)
      row.lastPlayed = Math.max(row.lastPlayed, battle.lastActivity)
      table.set(id, row)
    })
  }
  return [...table.values()].sort(compareStandings)
}

/**
 * The factions anybody has actually finished a battle with, most played first.
 *
 * Only these get a table. A list of every faction the catalogue knows would be
 * mostly empty tables on a young instance, and an empty table answers nothing.
 */
export function factionsPlayed(battles: readonly StandingBattle[], exclude: readonly string[] = []): string[] {
  const played = new Map<string, number>()
  for (const battle of counted(battles, exclude)) {
    for (const faction of battle.factions) {
      if (faction) played.set(faction, (played.get(faction) ?? 0) + 1)
    }
  }
  return [...played.entries()]
    .sort(([left, leftCount], [right, rightCount]) => rightCount - leftCount || left.localeCompare(right))
    .map(([id]) => id)
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

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

/** The catalogue army a seat brought, as the battle list already names it. */
export type StandingFaction = { slug: string; displayName: string; icon: string | null }

/** One finished battle, as the battle list already summarizes it. */
export type StandingBattle = {
  status: 'setup' | 'playing' | 'finished'
  playerIds: readonly string[]
  players: readonly string[]
  sides: readonly number[]
  scores: readonly number[]
  /** The army each seat brought, when it was built from a catalogue. */
  factions: readonly (StandingFaction | null)[]
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
  /** Wins less losses, which is the order of the table. A draw moves it nowhere. */
  net: number
  /** Victory points the player's side finished on, added up across their battles. */
  points: number
  lastPlayed: number
}

/**
 * What one battle did to one side of it.
 *
 * The only answer to that question: a profile's record and the leaderboard both
 * read it, so neither can decide a battle differently from the other.
 *
 * A side is one score, so an ally of a 2v1 is credited with the side's total
 * rather than the part of it that happens to sit on their seat — the whole point
 * of allies is that the resources and the scoring are shared. A concession is
 * decided before the points are: a player who gives up has lost the battle
 * whatever the board said when they did.
 */
export function battleOutcome(battle: StandingBattle, side: number): 'won' | 'lost' | 'drawn' {
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

export function sideScore(battle: StandingBattle, side: number) {
  return battle.sides.reduce((total, seat, index) => (seat === side ? total + (battle.scores[index] ?? 0) : total), 0)
}

/**
 * Which battles this table is allowed to count.
 *
 * `exclude` names accounts that are not players — the practice opponents an
 * instance seats. A battle with one of them in it is left out altogether rather
 * than counted for the human across the table: beating a seat nobody is sitting
 * in is not a result, and a table of who has beaten it most is not a leaderboard.
 *
 * A 2v2 counts the same as a duel. A side is the unit that scores everywhere else
 * in the product, so a leaderboard that split the shapes apart would be the one
 * surface disagreeing about what a result is — and on a table of four friends it
 * would split the few battles there are across tables that each answer nothing.
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
      if (!id || (faction !== undefined && battle.factions[seat]?.slug !== faction)) return
      const row = table.get(id) ?? {
        id,
        name: battle.players[seat] ?? 'Unknown player',
        battles: 0,
        won: 0,
        lost: 0,
        drawn: 0,
        net: 0,
        points: 0,
        lastPlayed: 0,
      }
      const result = battleOutcome(battle, side)
      row.battles += 1
      row[result] += 1
      row.net += result === 'won' ? 1 : result === 'lost' ? -1 : 0
      row.points += sideScore(battle, side)
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
export function factionsPlayed(battles: readonly StandingBattle[], exclude: readonly string[] = []): StandingFaction[] {
  const played = new Map<string, { faction: StandingFaction; count: number }>()
  for (const battle of counted(battles, exclude)) {
    for (const faction of battle.factions) {
      if (!faction) continue
      const seen = played.get(faction.slug)
      played.set(faction.slug, { faction, count: (seen?.count ?? 0) + 1 })
    }
  }
  return [...played.values()]
    .sort((one, other) => other.count - one.count || one.faction.displayName.localeCompare(other.faction.displayName))
    .map(({ faction }) => faction)
}

/**
 * The order the table is read in: wins, then the rate they came at, then the
 * losses behind them.
 *
 * Wins first, and both keys are columns the table prints, so a reader can check
 * the order against the row rather than taking it on trust. A rate alone would put
 * anybody's first lucky game on top at 100%, which is why it breaks ties rather
 * than setting them.
 *
 * The cost is that this rewards turning up: eleven wins from twenty battles
 * outranks nine from nine. `net` breaks the remaining ties, so two players on the
 * same wins and the same rate are separated by the losses it took — but it does
 * not undo the volume the first key rewards.
 *
 * Every tie is broken by something, ending in the player's id, so two instances
 * holding the same battles print the same table.
 */
export function compareStandings(one: Standing, other: Standing): number {
  return (
    other.won - one.won ||
    winRate(other) - winRate(one) ||
    other.net - one.net ||
    other.points - one.points ||
    one.name.localeCompare(other.name) ||
    one.id.localeCompare(other.id)
  )
}

/**
 * Wins as a share of battles played, a draw counting half rather than as a loss.
 *
 * Takes the counts rather than a whole row, so one player's record answers it the
 * same way a leaderboard row does.
 */
export function winRate(counts: { won: number; drawn: number; battles: number }): number {
  return counts.battles ? (counts.won + counts.drawn / 2) / counts.battles : 0
}

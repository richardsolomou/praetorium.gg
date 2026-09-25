/** Standings derive player rows from finished battles; a faction filter narrows the same fold. */

/** The catalogue army a seat brought, as the battle list already names it. */
export type StandingFaction = { slug: string; displayName: string; icon: string | null }

/** One finished battle, as the battle list already summarizes it. */
export type StandingBattle = {
  status: 'setup' | 'playing' | 'finished'
  playerIds: readonly string[]
  players: readonly string[]
  playerDetails?: readonly { id: string; name: string; image?: string | null }[]
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
  image: string | null
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

/** Concession takes precedence over score, and allies share their side’s result. */
export function battleOutcome(battle: StandingBattle, side: number): 'won' | 'lost' | 'drawn' {
  const conceded = battle.result?.concededBy
  const concededSide = conceded ? battle.sides[battle.playerIds.indexOf(conceded)] : undefined
  const totals = [...new Set(battle.sides)].map((index) => ({ index, total: sideScore(battle, index) }))
  return sideOutcome(totals, side, concededSide)
}

export function sideOutcome(
  sides: readonly { index: number; total: number }[],
  side: number,
  concededSide?: number,
): 'won' | 'lost' | 'drawn' {
  if (concededSide !== undefined) return concededSide === side ? 'lost' : 'won'
  const ours = sides.find((candidate) => candidate.index === side)?.total ?? 0
  const theirs = Math.max(...sides.filter((other) => other.index !== side).map((other) => other.total), Number.NEGATIVE_INFINITY)
  if (theirs === Number.NEGATIVE_INFINITY) return 'drawn'
  if (ours > theirs) return 'won'
  return ours < theirs ? 'lost' : 'drawn'
}

export function sideScore(battle: StandingBattle, side: number) {
  return battle.sides.reduce((total, seat, index) => (seat === side ? total + (battle.scores[index] ?? 0) : total), 0)
}

/** Exclude practice battles entirely, including the human side; all table shapes count together. */
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
        image: battle.playerDetails?.[seat]?.image ?? null,
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

/** Sort by printed wins and win rate, then net wins and stable tie breakers. */
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

import type { CatalogueEdition } from './catalogueEdition'
/** Standings rate players from finished battles; each faction table rates the seats that fielded it. */
import { ordinal, rate, rating, type Rating } from 'openskill'

/** The catalogue army a seat brought, as the battle list already names it. */
export type StandingFaction = {
  slug: string
  displayName: string
  icon: string | null
  edition?: Pick<CatalogueEdition, 'id' | 'name' | 'status'> | null
}

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
  /** OpenSkill's conservative estimate on a scale where a newcomer starts at 1000. The order of the table. */
  rating: number
  /** Victory points the player's side finished on, added up across their battles. */
  points: number
  lastPlayed: number
}

/** The overall table and one per faction played, most played first. */
export type StandingsTables = {
  overall: Standing[]
  factions: { faction: StandingFaction; rows: Standing[] }[]
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

/** A newcomer's conservative estimate is zero; this shows it as 1000, and one win between newcomers as about +70. */
const DISPLAY = { alpha: 20, target: 1000 }

type Entry = { row: Standing; skill: Rating }

/**
 * Rate every finished battle in the order it finished, each side an OpenSkill team.
 *
 * A faction rating moves only with the battles its player fielded that faction in,
 * but against everybody else's overall rating: rated only against each other, a
 * faction table's handful of games would measure its players against nothing.
 */
export function standings(battles: readonly StandingBattle[], { exclude = [] }: { exclude?: readonly string[] } = {}): StandingsTables {
  const overall = new Map<string, Entry>()
  const factions = new Map<string, { faction: StandingFaction; seats: number; entries: Map<string, Entry> }>()
  for (const battle of counted(battles, exclude).toSorted((one, other) => one.lastActivity - other.lastActivity)) {
    const sides = [...new Set(battle.sides)]
    const teams = sides.map((side) => battle.sides.flatMap((seated, seat) => (seated === side ? [seat] : [])))
    const rank = sides.map((side) => (battleOutcome(battle, side) === 'lost' ? 1 : 0))
    const placed = battle.sides.map((side, seat) => {
      const team = sides.indexOf(side)
      return [team, teams[team]!.indexOf(seat)] as const
    })
    /** Every seat's rating after this battle, had the seats come to it with these. */
    const rated = (skills: readonly Rating[]) => {
      const result = rate(
        teams.map((team) => team.map((seat) => skills[seat]!)),
        { rank },
      )
      return placed.map(([team, at]) => result[team]![at]!)
    }
    const players = battle.playerIds.map((id, seat) => entry(overall, battle, id, seat))
    const before = players.map((player) => player.skill)
    battle.playerIds.forEach((id, seat) => {
      const faction = battle.factions[seat]
      if (!faction) return
      const table = factions.get(faction.slug) ?? { faction, seats: 0, entries: new Map<string, Entry>() }
      factions.set(faction.slug, table)
      table.seats += 1
      const fielded = entry(table.entries, battle, id, seat)
      fielded.skill = rated(before.with(seat, fielded.skill))[seat]!
      record(fielded.row, battle, seat)
    })
    const after = rated(before)
    players.forEach((player, seat) => {
      player.skill = after[seat]!
      record(player.row, battle, seat)
    })
  }
  return {
    overall: ranked(overall),
    factions: [...factions.values()]
      .sort((one, other) => other.seats - one.seats || one.faction.displayName.localeCompare(other.faction.displayName))
      .map(({ faction, entries }) => ({ faction, rows: ranked(entries) })),
  }
}

function entry(entries: Map<string, Entry>, battle: StandingBattle, id: string, seat: number): Entry {
  const known = entries.get(id)
  if (known) return known
  const created = {
    row: {
      id,
      name: battle.players[seat] ?? 'Unknown player',
      image: battle.playerDetails?.[seat]?.image ?? null,
      battles: 0,
      won: 0,
      lost: 0,
      drawn: 0,
      rating: 0,
      points: 0,
      lastPlayed: 0,
    },
    skill: rating(),
  }
  entries.set(id, created)
  return created
}

function record(row: Standing, battle: StandingBattle, seat: number) {
  const side = battle.sides[seat]!
  row.battles += 1
  row[battleOutcome(battle, side)] += 1
  row.points += sideScore(battle, side)
  row.lastPlayed = Math.max(row.lastPlayed, battle.lastActivity)
}

/** Rounded before sorting, so the printed rating is the one the order was taken from. */
function ranked(entries: ReadonlyMap<string, Entry>): Standing[] {
  return [...entries.values()].map(({ row, skill }) => ({ ...row, rating: Math.round(ordinal(skill, DISPLAY)) })).sort(compareStandings)
}

function compareStandings(one: Standing, other: Standing): number {
  return (
    other.rating - one.rating ||
    other.won - one.won ||
    winRate(other) - winRate(one) ||
    averagePoints(other) - averagePoints(one) ||
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

/** Victory points a battle, which compares players who have played different amounts where a total cannot. */
export function averagePoints(counts: { points: number; battles: number }): number {
  return counts.battles ? counts.points / counts.battles : 0
}

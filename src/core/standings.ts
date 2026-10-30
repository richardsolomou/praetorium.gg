import type { CatalogueEdition } from './catalogueEdition'
import { isGuestSeat } from './newBattle'
import { routeSlug } from './slug'
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
  settings?: { manual?: boolean }
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

/** A player's overall rating as it stood after one of their counted battles. */
export type RatingPoint = { at: number; rating: number }

/**
 * The overall table and one per faction played, most played first, how far each counted
 * battle moved each seat's overall rating, and each player's overall rating after every one.
 */
export type StandingsTables<B extends StandingBattle = StandingBattle> = {
  overall: Standing[]
  factions: { faction: StandingFaction; rows: Standing[] }[]
  changes: Map<B, number[]>
  history: Map<string, RatingPoint[]>
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

/**
 * Exclude practice, guest, and manually tracked battles entirely, including the account holders' side; all table shapes count together.
 * The host plays a guest's side unverified, so counting it would let anyone rate themselves against opponents they made up.
 */
export function counted<B extends StandingBattle>(battles: readonly B[], exclude: readonly string[]) {
  const excluded = new Set(exclude)
  return battles.filter(
    (battle) =>
      battle.status === 'finished' && !battle.settings?.manual && !battle.playerIds.some((id) => excluded.has(id) || isGuestSeat(id)),
  )
}

/** A newcomer's conservative estimate is zero; this shows it as 1000, and one win between newcomers as about +50. */
const DISPLAY = { alpha: 20, target: 1000 }

/**
 * Twice OpenSkill's default performance spread: dice decide more of a battle than
 * the default assumes, so one result moves a rating less.
 */
const BETA = 25 / 3

const mean = (values: readonly number[]) => values.reduce((total, value) => total + value, 0) / values.length

/** The overall table's key. A faction table's key is its army's slug, which every rules version of the army shares. */
export const OVERALL = ''

export const armyOf = (faction: Pick<StandingFaction, 'displayName'>) => routeSlug(faction.displayName)

/** One player's place in one table as it stands: their skill and their record so far. */
export type Rated = { skill: Rating; row: Standing }

/**
 * Rate one counted battle, moving the entry `held` hands out for each seat in the overall table and, for a seat
 * that brought a catalogue army, that army's table. Returns how far it moved each seat's overall rating.
 *
 * A side is rated as one player of its allies' average skill, and each ally moves
 * as that player would: OpenSkill's own teams add their members up, which rates
 * two allies sharing one army's points as twice the player their lone opponent is.
 *
 * A faction rating moves only with the battles its player fielded that faction in,
 * but against everybody else's overall rating: rated only against each other, a
 * faction table's handful of games would measure its players against nothing.
 */
export function rateBattle(battle: StandingBattle, held: (table: string, seat: number) => Rated): number[] {
  const sides = [...new Set(battle.sides)]
  const teams = sides.map((side) => battle.sides.flatMap((seated, seat) => (seated === side ? [seat] : [])))
  const rank = sides.map((side) => (battleOutcome(battle, side) === 'lost' ? 1 : 0))
  /** Every seat's rating after this battle, had the seats come to it with these. */
  const rated = (skills: readonly Rating[]) => {
    const average = teams.map((team) => ({
      mu: mean(team.map((seat) => skills[seat]!.mu)),
      sigma: Math.sqrt(mean(team.map((seat) => skills[seat]!.sigma ** 2))),
    }))
    const result = rate(
      average.map((side) => [side]),
      { rank, beta: BETA },
    )
    return skills.map((skill, seat) => {
      const side = sides.indexOf(battle.sides[seat]!)
      const after = result[side]![0]!
      return { mu: skill.mu + after.mu - average[side]!.mu, sigma: (skill.sigma * after.sigma) / average[side]!.sigma }
    })
  }
  const players = battle.playerIds.map((_, seat) => held(OVERALL, seat))
  const before = players.map((player) => player.skill)
  battle.playerIds.forEach((_, seat) => {
    const brought = battle.factions[seat]
    if (!brought) return
    const fielded = held(armyOf(brought), seat)
    fielded.skill = rated(before.with(seat, fielded.skill))[seat]!
    record(fielded.row, battle, seat)
  })
  const after = rated(before)
  players.forEach((player, seat) => {
    player.skill = after[seat]!
    record(player.row, battle, seat)
  })
  return after.map((skill, seat) => shownRating(skill) - shownRating(before[seat]!))
}

/**
 * Rate every finished battle in the order it finished.
 *
 * Every battle given is rated; `activeSince` only decides who is listed, so a
 * rating does not change because an old battle stopped being shown.
 */
export function standings<B extends StandingBattle>(
  battles: readonly B[],
  { exclude = [], activeSince = 0 }: { exclude?: readonly string[]; activeSince?: number } = {},
): StandingsTables<B> {
  const overall = new Map<string, Rated>()
  const changes = new Map<B, number[]>()
  const history = new Map<string, RatingPoint[]>()
  const factions = new Map<string, { faction: StandingFaction; seats: number; entries: Map<string, Rated> }>()
  for (const battle of counted(battles, exclude).toSorted((one, other) => one.lastActivity - other.lastActivity)) {
    const change = rateBattle(battle, (table, seat) => {
      if (table === OVERALL) return entry(overall, battle, seat)
      const brought = battle.factions[seat]!
      const army = factions.get(table) ?? {
        faction: { slug: table, displayName: brought.displayName, icon: brought.icon },
        seats: 0,
        entries: new Map<string, Rated>(),
      }
      factions.set(table, army)
      army.seats += 1
      return entry(army.entries, battle, seat)
    })
    changes.set(battle, change)
    battle.playerIds.forEach((id) => {
      const points = history.get(id) ?? []
      points.push({ at: battle.lastActivity, rating: shownRating(overall.get(id)!.skill) })
      history.set(id, points)
    })
  }
  return {
    overall: ranked(overall, activeSince),
    factions: [...factions.values()]
      .sort((one, other) => other.seats - one.seats || one.faction.displayName.localeCompare(other.faction.displayName))
      .map(({ faction, entries }) => ({ faction, rows: ranked(entries, activeSince) }))
      .filter((table) => table.rows.length),
    changes,
    history,
  }
}

function entry(entries: Map<string, Rated>, battle: StandingBattle, seat: number): Rated {
  const id = battle.playerIds[seat]!
  const known = entries.get(id)
  if (known) return known
  const created = newcomer(id, battle.players[seat] ?? 'Unknown player', battle.playerDetails?.[seat]?.image ?? null)
  entries.set(id, created)
  return created
}

/** A player in a table before their first battle in it. */
export function newcomer(id: string, name = '', image: string | null = null): Rated {
  return { row: { id, name, image, battles: 0, won: 0, lost: 0, drawn: 0, rating: 0, points: 0, lastPlayed: 0 }, skill: rating() }
}

function record(row: Standing, battle: StandingBattle, seat: number) {
  const side = battle.sides[seat]!
  row.battles += 1
  row[battleOutcome(battle, side)] += 1
  row.points += sideScore(battle, side)
  row.lastPlayed = Math.max(row.lastPlayed, battle.lastActivity)
}

/** The rating a player sees. */
export const shownRating = (skill: Rating) => Math.round(ordinal(skill, DISPLAY))

/** Rounded before sorting, so the printed rating is the one the order was taken from. */
function ranked(entries: ReadonlyMap<string, Rated>, activeSince: number): Standing[] {
  return [...entries.values()]
    .filter(({ row }) => row.lastPlayed >= activeSince)
    .map(({ row, skill }) => ({ ...row, rating: shownRating(skill) }))
    .sort(compareStandings)
}

export function compareStandings(one: Standing, other: Standing): number {
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

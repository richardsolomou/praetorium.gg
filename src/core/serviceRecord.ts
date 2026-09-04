/**
 * One player's record, folded from the battles they were in.
 *
 * The leaderboard answers "who is winning" across everybody; this answers "how
 * does this player play" for one of them. Both read `battleOutcome` and
 * `sideScore` from `standings.ts`, so a profile can never decide a battle
 * differently from the table that ranks it.
 *
 * Nothing here is stored either. Every number is a fold over the same finished
 * battles a reader of the profile is allowed to open, which is why a filtered
 * record costs nothing but narrowing the list first.
 */

import { battleOutcome, sideScore, type StandingBattle, winRate } from './standings'

/**
 * A battle as a record needs it: everything a standing needs, plus who went
 * first, the two halves of each side's score, and the facts a reader filters by.
 */
export type RecordBattle = StandingBattle & {
  /** The seat that took the first turn, once the battle has begun. */
  firstPlayerId: string | null
  /** Each seat's primary and secondary points, which `scores` only carries added together. */
  primaries: readonly number[]
  secondaries: readonly number[]
  detachments: readonly (readonly string[])[]
  /** Read from the settings the battle list already carries rather than copied beside them. */
  settings: { missionPackId: string | null; limit: number | null }
}

/** A win rate over some subset of the battles, and how many that subset was. */
export type Split = { battles: number; won: number; lost: number; drawn: number; rate: number }

export type ServiceRecord = {
  battles: number
  won: number
  lost: number
  drawn: number
  rate: number
  /** The same record split by whether the player's side took the first turn. */
  goingFirst: Split
  goingSecond: Split
  /** Their side's points per battle, over everything and over each kind of result. */
  averagePoints: number
  averageInWins: number
  averageInLosses: number
  /** How far behind they finished in the battles they lost, per battle. */
  lossDifferential: number
  averagePrimary: number
  averageSecondary: number
  /** Consecutive wins, counting back from the most recent battle, and the best run. */
  currentStreak: number
  longestStreak: number
}

/** What a reader can narrow the record by. Every absent field means "all of them". */
export type RecordFilter = {
  faction?: string
  detachment?: string
  opponentFaction?: string
  opponentDetachment?: string
  opponentId?: string
  missionPackId?: string
  limit?: number
}

/** One seat's view of a battle: which side they sat on, and what it did to them. */
type Appearance = {
  battle: RecordBattle
  side: number
  seat: number
  result: 'won' | 'lost' | 'drawn'
  points: number
}

function appearances(battles: readonly RecordBattle[], playerId: string): Appearance[] {
  return battles
    .filter((battle) => battle.status === 'finished')
    .flatMap((battle) => {
      const seat = battle.playerIds.indexOf(playerId)
      const side = battle.sides[seat]
      if (seat === -1 || side === undefined) return []
      return [{ battle, seat, side, result: battleOutcome(battle, side), points: sideScore(battle, side) }]
    })
    .toSorted((one, other) => one.battle.lastActivity - other.battle.lastActivity)
}

/** The seats facing this one. A 2v2 has two of them, and they share their side's score. */
const opposingSeats = (appearance: Appearance) => appearance.battle.sides.flatMap((side, seat) => (side === appearance.side ? [] : [seat]))

function matches(appearance: Appearance, filter: RecordFilter) {
  const { battle, seat } = appearance
  const opponents = opposingSeats(appearance)
  const mine = (values: readonly (readonly string[])[]) => values[seat] ?? []
  if (filter.faction !== undefined && battle.factions[seat]?.slug !== filter.faction) return false
  if (filter.detachment !== undefined && !mine(battle.detachments).includes(filter.detachment)) return false
  if (filter.missionPackId !== undefined && battle.settings.missionPackId !== filter.missionPackId) return false
  if (filter.limit !== undefined && battle.settings.limit !== filter.limit) return false
  if (filter.opponentId !== undefined && !opponents.some((other) => battle.playerIds[other] === filter.opponentId)) return false
  if (filter.opponentFaction !== undefined && !opponents.some((other) => battle.factions[other]?.slug === filter.opponentFaction)) {
    return false
  }
  const wanted = filter.opponentDetachment
  if (wanted !== undefined && !opponents.some((other) => (battle.detachments[other] ?? []).includes(wanted))) return false
  return true
}

/** Whether the player's own side took the first turn. Unknown until the battle begins. */
function wentFirst(appearance: Appearance): boolean | null {
  const first = appearance.battle.firstPlayerId
  if (!first) return null
  const side = appearance.battle.sides[appearance.battle.playerIds.indexOf(first)]
  return side === undefined ? null : side === appearance.side
}

function split(taken: readonly Appearance[]): Split {
  const counts = {
    battles: taken.length,
    won: taken.filter((one) => one.result === 'won').length,
    lost: taken.filter((one) => one.result === 'lost').length,
    drawn: taken.filter((one) => one.result === 'drawn').length,
  }
  return { ...counts, rate: winRate(counts) }
}

const mean = (values: readonly number[]) => (values.length ? values.reduce((total, value) => total + value, 0) / values.length : 0)

/**
 * The longest run of wins, and the run still going.
 *
 * A draw breaks a streak the same as a loss does: a streak is consecutive wins,
 * and a battle nobody won is not one of them.
 */
function streaks(taken: readonly Appearance[]) {
  let longest = 0
  let running = 0
  for (const one of taken) {
    running = one.result === 'won' ? running + 1 : 0
    longest = Math.max(longest, running)
  }
  return { currentStreak: running, longestStreak: longest }
}

/**
 * The battles a filtered record was folded from, newest first.
 *
 * The same narrowing the record uses, so the list under a filtered record is the
 * battles that record counted rather than a second answer to the same question.
 */
export function filterBattles<T extends RecordBattle>(battles: readonly T[], playerId: string, filter: RecordFilter = {}): T[] {
  const taken = appearances(battles, playerId).filter((one) => matches(one, filter))
  return taken.map((one) => one.battle as T).toReversed()
}

export function serviceRecord(battles: readonly RecordBattle[], playerId: string, filter: RecordFilter = {}): ServiceRecord {
  const taken = appearances(battles, playerId).filter((one) => matches(one, filter))
  const wins = taken.filter((one) => one.result === 'won')
  const losses = taken.filter((one) => one.result === 'lost')
  const first = taken.filter((one) => wentFirst(one) === true)
  const second = taken.filter((one) => wentFirst(one) === false)
  return {
    ...split(taken),
    goingFirst: split(first),
    goingSecond: split(second),
    averagePoints: mean(taken.map((one) => one.points)),
    averageInWins: mean(wins.map((one) => one.points)),
    averageInLosses: mean(losses.map((one) => one.points)),
    lossDifferential: mean(
      losses.map((one) => {
        const best = Math.max(...opposingSeats(one).map((seat) => sideScore(one.battle, one.battle.sides[seat] ?? 0)))
        return best - one.points
      }),
    ),
    averagePrimary: mean(taken.map((one) => sideTotal(one, one.battle.primaries))),
    averageSecondary: mean(taken.map((one) => sideTotal(one, one.battle.secondaries))),
    ...streaks(taken),
  }
}

/** A side's half of the score, added up the same way `sideScore` adds the whole. */
function sideTotal(appearance: Appearance, values: readonly number[]) {
  return appearance.battle.sides.reduce((total, side, seat) => (side === appearance.side ? total + (values[seat] ?? 0) : total), 0)
}

/** One value a reader can filter by, and how many of their battles carry it. */
export type Facet = { value: string; label: string; battles: number }

/** Every dimension of the record a reader can narrow, with the values they have played. */
export type RecordFacets = {
  factions: Facet[]
  detachments: Facet[]
  opponentFactions: Facet[]
  opponentDetachments: Facet[]
  opponents: Facet[]
  missionPacks: Facet[]
  limits: Facet[]
}

/**
 * The values worth offering, which is only the ones this player's battles hold.
 *
 * Counted rather than listed from the catalogue, for the same reason the
 * leaderboard only offers factions somebody has played: an option that narrows to
 * nothing is a control that wastes a tap.
 */
export function recordFacets(battles: readonly RecordBattle[], playerId: string): RecordFacets {
  const taken = appearances(battles, playerId)
  const tally = new Map<keyof RecordFacets, Map<string, Facet>>()
  const add = (dimension: keyof RecordFacets, value: string | null | undefined, label: string) => {
    if (value === null || value === undefined || value === '') return
    const dimensionTally = tally.get(dimension) ?? new Map<string, Facet>()
    const seen = dimensionTally.get(value)
    dimensionTally.set(value, { value, label, battles: (seen?.battles ?? 0) + 1 })
    tally.set(dimension, dimensionTally)
  }
  for (const one of taken) {
    const { battle, seat } = one
    add('factions', battle.factions[seat]?.slug, battle.factions[seat]?.displayName ?? '')
    for (const detachment of battle.detachments[seat] ?? []) add('detachments', detachment, detachment)
    add('missionPacks', battle.settings.missionPackId, battle.settings.missionPackId ?? '')
    add('limits', battle.settings.limit === null ? null : String(battle.settings.limit), `${battle.settings.limit} points`)
    // One battle counts once per dimension, so a 2v2 whose pair brought the same
    // army does not tally as two battles against it.
    const seats = opposingSeats(one)
    const facing = new Map(
      seats.flatMap((other) => (battle.factions[other] ? [[battle.factions[other].slug, battle.factions[other]]] : [])),
    )
    for (const [slug, faction] of facing) add('opponentFactions', slug, faction.displayName)
    for (const detachment of new Set(seats.flatMap((other) => battle.detachments[other] ?? []))) {
      add('opponentDetachments', detachment, detachment)
    }
    for (const other of seats) add('opponents', battle.playerIds[other], battle.players[other] ?? 'Unknown player')
  }
  const dimension = (key: keyof RecordFacets) =>
    [...(tally.get(key)?.values() ?? [])].toSorted((one, other) => other.battles - one.battles || one.label.localeCompare(other.label))
  return {
    factions: dimension('factions'),
    detachments: dimension('detachments'),
    opponentFactions: dimension('opponentFactions'),
    opponentDetachments: dimension('opponentDetachments'),
    opponents: dimension('opponents'),
    missionPacks: dimension('missionPacks'),
    limits: dimension('limits'),
  }
}

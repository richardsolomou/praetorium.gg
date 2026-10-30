/** Fold a player’s visible finished battles with the same outcome and score functions as the leaderboard; store no second record. */

import { groupBy } from './collections'
import { isGuestSeat } from './newBattle'
import { routeSlug } from './slug'
import { type BattleState, mayNameCard, type PlayerId, pointsLabel } from './battle'
import {
  battleOutcome,
  opponentScore,
  sideScore,
  type StandingBattle,
  type StandingFaction,
  type BattleOutcome,
  winRate,
} from './standings'

/**
 * One stratagem use as the log states it, with the page printing it where the
 * server found one. `cp` is what was actually paid, including a board-made price.
 */
export type StratagemPlay = {
  key: string
  name: string
  cp: number
  detachment?: string
  reference?: { catalogueId: string; detachmentId: string }
}

/** A secondary card a side held, and the points the log banked against it. */
export type CardPlay = { key: string; name: string; points: number; reference?: { packId: string } }

/** The primary mission a side played. */
type MissionPlay = { key: string; name: string; reference?: { packId: string; you: string; opponent: string } }

/** What one seat's army did with the side's resources, as the reader may see it. */
export type SeatPlay = { cpSpent: number; stratagems: readonly StratagemPlay[]; cards: readonly CardPlay[]; primary: MissionPlay | null }

/**
 * Each seat's stratagems, cards and primary, read off a folded battle.
 *
 * The fold has already skipped every undone command, so an undone stratagem was
 * never used here. A card put back the moment it was drawn was never held, and a
 * face-down Secret Mission this reader may not name is left out altogether rather
 * than counted under another name: `mayNameCard` is the answer `battleView` masks
 * by, so a record cannot name a card the battle itself withholds.
 */
export function seatPlays(state: BattleState, viewerId: PlayerId | null): SeatPlay[] {
  return state.players.map((player) => ({
    cpSpent: player.cpSpent,
    stratagems: player.uses.map(({ key, name, cp }) => {
      const detachment = player.stratagems.find((stratagem) => stratagem.key === key)?.detachment
      return { key, name, cp, ...(detachment ? { detachment } : {}) }
    }),
    cards: [...new Map(player.secondaries.map((secondary) => [secondary.key, secondary])).values()]
      .filter((secondary) => player.secondaryStatus[secondary.key] !== 'returned' && mayNameCard(state, viewerId, player, secondary.key))
      .map(({ key, name }) => ({ key, name, points: player.scored[key] ?? 0 })),
    primary: player.primaryCard ? { key: player.primaryCard.key, name: player.primaryCard.name } : null,
  }))
}

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
  plays: readonly SeatPlay[]
}

/** A win rate over some subset of the battles, and how many that subset was. */
export type Split = { battles: number; won: number; lost: number; drawn: number; rate: number }

export type PerformanceRow = { key: string; label: string; total: Split; months: { month: string; split: Split }[] }
export type PersonalPerformance = { detachments: PerformanceRow[]; missions: PerformanceRow[]; sizes: PerformanceRow[] }

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
  /** Command points their side spent per battle: on stratagems, and anything else the log records as spent. */
  averageCpSpent: number
  /** Their side's points over the command points it spent, or null when it spent none. */
  pointsPerCp: number | null
  /** Every stratagem their side used, most used first. */
  stratagems: StratagemRecord[]
  /** The stratagems with the best and worst win rate, among those used in at least `RECORD_SAMPLE` battles. */
  bestStratagem: StratagemRecord | null
  worstStratagem: StratagemRecord | null
  /** Every card their side held, most held first. */
  cards: CardRecord[]
  /** The cards earning most and least per battle held, among those held at least `RECORD_SAMPLE` times. */
  bestCard: CardRecord | null
  worstCard: CardRecord | null
  primaryMissions: MissionRecord[]
  opposingFactions: FactionRecord[]
  opponents: OpponentRecord[]
}

/** `battles` counts the battles the stratagem was used in; `rate` is the win rate across them. */
export type StratagemRecord = {
  key: string
  name: string
  uses: number
  cp: number
  battles: number
  rate: number
  reference?: StratagemPlay['reference']
}

/** `scored` counts the battles the card banked any points in; `average` is its points per battle held. */
export type CardRecord = {
  key: string
  name: string
  held: number
  scored: number
  points: number
  average: number
  reference?: CardPlay['reference']
}

type MissionRecord = Omit<Split, 'rate'> & { key: string; name: string; averagePoints: number; reference?: MissionPlay['reference'] }

type FactionRecord = Split & { faction: StandingFaction }

type OpponentRecord = Split & { id: string; name: string; image: string | null }

/** How many battles a card or stratagem has to appear in before it can be the best or the worst. */
export const RECORD_SAMPLE = 3

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
  result: BattleOutcome
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

/** Monthly results from the same filtered appearances as the visible service record. */
export function personalPerformance(battles: readonly RecordBattle[], playerId: string, filter: RecordFilter = {}): PersonalPerformance {
  const taken = appearances(battles, playerId).filter((one) => matches(one, filter))
  const rows = (choices: (one: Appearance) => readonly { key: string; label: string }[]): PerformanceRow[] => {
    const groups = new Map<string, { label: string; appearances: Appearance[] }>()
    for (const one of taken) {
      for (const choice of choices(one)) {
        const group = groups.get(choice.key) ?? { label: choice.label, appearances: [] }
        group.appearances.push(one)
        groups.set(choice.key, group)
      }
    }
    return [...groups]
      .map(([key, { label, appearances: played }]) => {
        const byMonth = groupBy(played, (one) => new Date(one.battle.lastActivity).toISOString().slice(0, 7))
        return {
          key,
          label,
          total: split(played),
          months: [...byMonth]
            .map(([month, entries]) => ({ month, split: split(entries) }))
            .toSorted((left, right) => right.month.localeCompare(left.month)),
        }
      })
      .toSorted((one, other) => other.total.battles - one.total.battles || one.label.localeCompare(other.label))
  }
  return {
    detachments: rows((one) => [...new Set(one.battle.detachments[one.seat] ?? [])].map((name) => ({ key: name, label: name }))),
    missions: rows((one) => {
      const mission = sidePlay(one).primary
      return mission ? [{ key: mission.key, label: mission.name }] : []
    }),
    sizes: rows((one) => {
      const limit = one.battle.settings.limit
      return limit ? [{ key: String(limit), label: pointsLabel(limit) }] : []
    }),
  }
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
    lossDifferential: mean(losses.map((one) => opponentScore(one.battle, one.side) - one.points)),
    averagePrimary: mean(taken.map((one) => sideTotal(one, one.battle.primaries))),
    averageSecondary: mean(taken.map((one) => sideTotal(one, one.battle.secondaries))),
    ...streaks(taken),
    ...resources(taken),
    ...cardRecords(taken),
    primaryMissions: missionRecords(taken),
    opposingFactions: factionRecords(taken),
    opponents: opponentRecords(taken),
  }
}

/**
 * What the player's side did with its resources, over each seat on that side.
 *
 * A side is one pool of command points, stratagems and cards, the same way it is
 * one score, so an ally is credited with the side's whole spend and every card it
 * held — added across the side's seats exactly as `sideTotal` adds its points.
 */
function sidePlay(appearance: Appearance) {
  const plays = appearance.battle.sides.flatMap((side, seat) => (side === appearance.side ? (appearance.battle.plays[seat] ?? []) : []))
  return {
    cpSpent: plays.reduce((total, play) => total + play.cpSpent, 0),
    stratagems: plays.flatMap((play) => play.stratagems),
    cards: [...new Map(plays.flatMap((play) => play.cards).map((card) => [card.key, card])).values()],
    primary: plays.find((play) => play.primary)?.primary ?? null,
  }
}

/**
 * What a stratagem or card row is counted under. Catalogue revisions have re-keyed
 * the same card, from a slug of its name to the source's own id, and battle logs keep
 * whichever key they were written with, so the name is the identity that holds.
 */
const rowIdentity = ({ name }: { name: string }) => routeSlug(name)

/** Newest first, so a row keeps the key, name and page its most recent battle gave it. */
const newestFirst = (taken: readonly Appearance[]) => taken.toReversed().map((one) => ({ one, play: sidePlay(one) }))

function resources(taken: readonly Appearance[]) {
  const played = newestFirst(taken)
  const spent = played.reduce((total, { play }) => total + play.cpSpent, 0)
  const points = taken.reduce((total, one) => total + one.points, 0)
  const rows = new Map<string, StratagemRecord>()
  const usedIn = new Map<string, Set<Appearance>>()
  for (const { one, play } of played) {
    for (const use of play.stratagems) {
      const identity = rowIdentity(use)
      const row = rows.get(identity) ?? { key: use.key, name: use.name, uses: 0, cp: 0, battles: 0, rate: 0 }
      row.uses += 1
      row.cp += use.cp
      if (!row.reference && use.reference) row.reference = use.reference
      rows.set(identity, row)
      usedIn.set(identity, (usedIn.get(identity) ?? new Set()).add(one))
    }
  }
  const sorted = [...rows.values()]
    .map((row) => {
      const { battles, rate } = split([...(usedIn.get(rowIdentity(row)) ?? [])])
      return { ...row, battles, rate }
    })
    .toSorted((one, other) => other.uses - one.uses || other.cp - one.cp || one.name.localeCompare(other.name))
  const { best, worst } = extremes(
    sorted,
    (row) => row.battles,
    (row) => row.rate,
  )
  return {
    averageCpSpent: mean(played.map(({ play }) => play.cpSpent)),
    pointsPerCp: spent ? points / spent : null,
    stratagems: sorted,
    bestStratagem: best,
    worstStratagem: worst,
  }
}

/**
 * The rows scoring highest and lowest, read only among rows seen in `RECORD_SAMPLE`
 * battles, so one lucky game cannot top the table, and only once two rows qualify:
 * a row compared with nothing is not the best of anything. Ties go to the row seen
 * in more battles, then by name.
 */
function extremes<Row extends { name: string }>(rows: readonly Row[], seen: (row: Row) => number, score: (row: Row) => number) {
  const ranked = rows
    .filter((row) => seen(row) >= RECORD_SAMPLE)
    .toSorted((one, other) => score(other) - score(one) || seen(other) - seen(one) || one.name.localeCompare(other.name))
  const enough = ranked.length >= 2
  return { best: enough ? (ranked[0] ?? null) : null, worst: enough ? (ranked.at(-1) ?? null) : null }
}

/** Each card's record, and the best and worst of them by points per battle held. */
function cardRecords(taken: readonly Appearance[]) {
  const rows = new Map<string, CardRecord>()
  for (const { play } of newestFirst(taken)) {
    for (const card of play.cards) {
      const identity = rowIdentity(card)
      const row = rows.get(identity) ?? { key: card.key, name: card.name, held: 0, scored: 0, points: 0, average: 0 }
      row.held += 1
      row.scored += card.points > 0 ? 1 : 0
      row.points += card.points
      if (!row.reference && card.reference) row.reference = card.reference
      rows.set(identity, row)
    }
  }
  const cards = [...rows.values()]
    .map((row) => ({ ...row, average: row.points / row.held }))
    .toSorted((one, other) => other.held - one.held || other.average - one.average || one.name.localeCompare(other.name))
  const { best, worst } = extremes(
    cards,
    (card) => card.held,
    (card) => card.average,
  )
  return { cards, bestCard: best, worstCard: worst }
}

function missionRecords(taken: readonly Appearance[]): MissionRecord[] {
  const rows = new Map<string, { row: MissionRecord; points: number }>()
  for (const { one, play } of newestFirst(taken)) {
    if (!play.primary) continue
    const { key, name, reference } = play.primary
    const entry = rows.get(key) ?? { row: { key, name, battles: 0, won: 0, lost: 0, drawn: 0, averagePoints: 0 }, points: 0 }
    entry.row.battles += 1
    entry.row[one.result] += 1
    entry.points += one.points
    if (!entry.row.reference && reference) entry.row.reference = reference
    rows.set(key, entry)
  }
  return [...rows.values()]
    .map(({ row, points }) => ({ ...row, averagePoints: points / row.battles }))
    .toSorted((one, other) => other.battles - one.battles || other.won - one.won || one.name.localeCompare(other.name))
}

/** Each army faced, a 2v2 against two of the same counting once, as its facet does. */
function factionRecords(taken: readonly Appearance[]): FactionRecord[] {
  const rows = new Map<string, { faction: StandingFaction; against: Appearance[] }>()
  for (const one of taken) {
    const facing = new Map(
      opposingSeats(one).flatMap((seat) => {
        const faction = one.battle.factions[seat]
        return faction ? [[faction.slug, faction] as const] : []
      }),
    )
    for (const [slug, faction] of facing) {
      const row = rows.get(slug) ?? { faction, against: [] }
      row.against.push(one)
      rows.set(slug, row)
    }
  }
  return [...rows.values()]
    .map(({ faction, against }) => ({ faction, ...split(against) }))
    .toSorted(
      (one, other) =>
        other.battles - one.battles || other.rate - one.rate || one.faction.displayName.localeCompare(other.faction.displayName),
    )
}

/** Results against each signed-in player on the other side, named as their most recent battle named them. */
function opponentRecords(taken: readonly Appearance[]): OpponentRecord[] {
  const rows = new Map<string, { name: string; image: string | null; against: Appearance[] }>()
  for (const { one } of newestFirst(taken)) {
    for (const seat of opposingSeats(one)) {
      const id = one.battle.playerIds[seat]
      if (!id || isGuestSeat(id)) continue
      const row = rows.get(id) ?? {
        name: one.battle.players[seat] ?? '',
        image: one.battle.playerDetails?.find((player) => player.id === id)?.image ?? null,
        against: [],
      }
      row.against.push(one)
      rows.set(id, row)
    }
  }
  return [...rows]
    .map(([id, { name, image, against }]) => ({ id, name, image, ...split(against) }))
    .toSorted((one, other) => other.battles - one.battles || other.rate - one.rate || one.name.localeCompare(other.name))
}

/** A side's half of the score, added up the same way `sideScore` adds the whole. */
function sideTotal(appearance: Appearance, values: readonly number[]) {
  return appearance.battle.sides.reduce((total, side, seat) => (side === appearance.side ? total + (values[seat] ?? 0) : total), 0)
}

/** One value a reader can filter by, and how many of their battles carry it. */
/** `latest` is when the most recent of those battles was last played. */
export type Facet = { value: string; label: string; battles: number; latest: number; image?: string | null }

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
  let playedAt = 0
  const add = (dimension: keyof RecordFacets, value: string | null | undefined, label: string, image?: string | null) => {
    if (value === null || value === undefined || value === '') return
    const dimensionTally = tally.get(dimension) ?? new Map<string, Facet>()
    const seen = dimensionTally.get(value)
    dimensionTally.set(value, {
      value,
      label,
      battles: (seen?.battles ?? 0) + 1,
      latest: Math.max(seen?.latest ?? 0, playedAt),
      ...(image !== undefined ? { image } : seen?.image !== undefined ? { image: seen.image } : {}),
    })
    tally.set(dimension, dimensionTally)
  }
  for (const one of taken) {
    const { battle, seat } = one
    playedAt = battle.lastActivity
    add('factions', battle.factions[seat]?.slug, battle.factions[seat]?.displayName ?? '')
    for (const detachment of battle.detachments[seat] ?? []) add('detachments', detachment, detachment)
    add('missionPacks', battle.settings.missionPackId, battle.settings.missionPackId ?? '')
    if (battle.settings.limit !== null) add('limits', String(battle.settings.limit), pointsLabel(battle.settings.limit))
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
    // A guest seat belongs to one battle, so it narrows nothing a battle list does not already show.
    for (const other of seats.filter((at) => !isGuestSeat(battle.playerIds[at] ?? ''))) {
      add('opponents', battle.playerIds[other], battle.players[other] ?? 'Unknown player', battle.playerDetails?.[other]?.image)
    }
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

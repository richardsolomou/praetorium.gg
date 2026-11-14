/**
 * Builds the percentiles `rosterGradeCalibration` holds from measured tournament lists; the IO lives in
 * `scripts/calibrateRosterGrades.ts`.
 */
import { groupBy } from './collections'
import type { CalibratedSize, Peers } from './rosterGradeCalibration'
import {
  CATEGORIES,
  gradedTargets,
  placement,
  scoredMeasures,
  type GradedUnit,
  type MetricKey,
  type ReferenceTargetKey,
} from './rosterGrades'

export const CALIBRATED_SIZES = [600, 1000, 2000, 3000] as const satisfies readonly CalibratedSize[]
/** A catalogue or parent with fewer tournament lists than this is placed among every faction's. */
export const MIN_PEERS = 40
/** The share of tournament lists that must have a unit to take half of a target alone before lacking one is named. */
const EXPECTED_SHARE = 0.9
const DRAWS = 6

/** A tournament list, or one drawn from its units, at a battle size. */
export type CalibrationList = { catalogueName: string; size: CalibratedSize; units: readonly GradedUnit[] }

/** A generator seeded from text, so every run draws the same smaller lists from the same tournament lists. */
export function seededRandom(seed: string) {
  let state = 2166136261
  for (const character of seed) state = Math.imul(state ^ character.charCodeAt(0), 16777619)
  return () => {
    state = (state + 0x6d2b79f5) | 0
    let mixed = Math.imul(state ^ (state >>> 15), 1 | state)
    mixed = (mixed + Math.imul(mixed ^ (mixed >>> 7), 61 | mixed)) ^ mixed
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296
  }
}

/**
 * Of six draws of a list's own units that each fill what they can of `limit` in a random order, the one with the
 * most units, as a player fits as much as they can into a small game. A unit stays with everything attached to it.
 */
export function drawnList(units: readonly GradedUnit[], limit: number, random: () => number): GradedUnit[] {
  let best: GradedUnit[] = []
  for (let draw = 0; draw < DRAWS; draw++) {
    const shuffled = [...units]
    for (let index = shuffled.length - 1; index > 0; index--) {
      const swap = Math.floor(random() * (index + 1))
      ;[shuffled[index], shuffled[swap]] = [shuffled[swap]!, shuffled[index]!]
    }
    let spent = 0
    const kept = shuffled.filter((unit) => {
      if (spent + unit.points > limit) return false
      spent += unit.points
      return true
    })
    if (kept.length > best.length) best = kept
  }
  return best
}

/**
 * Every size's lists from the 2,000-point tournament lists: each list itself, a draw of it at 600 and 1,000
 * points, and, for Onslaught, the list with a 1,000-point draw from another list of its faction.
 */
export function calibrationLists(lists: readonly { id: string; catalogueName: string; units: readonly GradedUnit[] }[]) {
  const byCatalogue = groupBy(lists, (list) => list.catalogueName)
  return lists.flatMap((list): CalibrationList[] => {
    const random = seededRandom(list.id)
    const others = byCatalogue.get(list.catalogueName)!.filter((other) => other !== list)
    const partner = others[Math.floor(random() * others.length)]
    return [
      { catalogueName: list.catalogueName, size: 2000, units: list.units },
      { catalogueName: list.catalogueName, size: 1000, units: drawnList(list.units, 1000, random) },
      { catalogueName: list.catalogueName, size: 600, units: drawnList(list.units, 600, random) },
      ...(partner
        ? [{ catalogueName: list.catalogueName, size: 3000 as const, units: [...list.units, ...drawnList(partner.units, 1000, random)] }]
        : []),
    ]
  })
}

/** A value at every fifth percentile, 0th to 100th, each one a value some list has, to two decimals. */
export function quantiles(values: readonly number[]): number[] {
  const sorted = values.toSorted((left, right) => left - right)
  return Array.from({ length: 21 }, (_, step) => Math.round(sorted[Math.round((step / 20) * (sorted.length - 1))]! * 100) / 100)
}

/** The peer groups a catalogue's lists belong to: every faction's, then the catalogue and each parent below the top level. */
function peerKeys(catalogueName: string) {
  const parts = catalogueName.split(' - ')
  return ['', ...parts.slice(1).map((_, index) => parts.slice(0, index + 2).join(' - '))]
}

const quantilesOf = <Key extends string>(keys: readonly Key[], values: (key: Key) => (number | null)[]) =>
  Object.fromEntries(
    keys.flatMap((key) => {
      const known = values(key).filter((value) => value !== null)
      return known.length ? [[key, quantiles(known)]] : []
    }),
  ) as Partial<Record<Key, number[]>>

/**
 * Peers for one group of lists at one size, placed as `rosterGrades` places a list: measure percentiles first,
 * then each list's category averages among them, then its average category percentile among those.
 */
function peersOf(lists: readonly CalibrationList[], size: CalibratedSize): Peers {
  const scored = lists.map((list) => scoredMeasures(list.units, size))
  const metrics = [...new Set(scored.flatMap((measures) => Object.keys(measures) as MetricKey[]))]
  const measures = quantilesOf(metrics, (key) => scored.map((list) => list[key] ?? null))
  const averages = lists.map((list) => placement(list.units, size, { measures }).categories)
  const categories = quantilesOf(
    CATEGORIES.map((category) => category.key),
    (key) => averages.map((list) => list.find((category) => category.key === key)!.average),
  ) as Record<string, number[]>
  const overall = lists.flatMap((list) => placement(list.units, size, { measures, categories }).overall ?? [])
  return { measures, categories, overall: quantiles(overall) }
}

/** The targets at least nine in ten lists of a size have a unit to take half of alone. */
function expectedTools(lists: readonly CalibrationList[], size: CalibratedSize): ReferenceTargetKey[] {
  return gradedTargets(size)
    .filter(
      (target) =>
        lists.filter((list) => list.units.some((unit) => (unit.removes[target.key] ?? 0) >= 0.5)).length >= EXPECTED_SHARE * lists.length,
    )
    .map((target) => target.key)
}

/** The calibration table for every battle size, keyed as `rosterGradeCalibration` keys it. */
export function calibrate(lists: readonly CalibrationList[]) {
  const sized = (size: CalibratedSize) => lists.filter((list) => list.size === size && list.units.length)
  const expected = {} as Record<CalibratedSize, ReferenceTargetKey[]>
  const peers = {} as Record<CalibratedSize, Record<string, Peers>>
  for (const size of CALIBRATED_SIZES) {
    const groups = groupBy(
      sized(size).flatMap((list) => peerKeys(list.catalogueName).map((key) => [key, list] as const)),
      ([key]) => key,
    )
    expected[size] = expectedTools(sized(size), size)
    peers[size] = Object.fromEntries(
      [...groups]
        .filter(([key, members]) => key === '' || members.length >= MIN_PEERS)
        .toSorted(([left], [right]) => left.localeCompare(right))
        .map(([key, members]) => [
          key,
          peersOf(
            members.map(([, list]) => list),
            size,
          ),
        ]),
    )
  }
  return { expected, peers }
}

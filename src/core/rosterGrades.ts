/**
 * Roster grades: what a roster can do on the table, scored 0–100 and graded A–D, never a prediction of who wins.
 *
 * Like Lighthouse, each measure scores the percentile it reaches among real examples: 11th-edition tournament
 * lists (2,000 points, events from 20 June to 8 November 2026) that import cleanly, of which only these
 * percentiles are kept. A list is compared with lists of its own battle size: smaller sizes are random
 * sub-lists drawn from the tournament lists' own units, and Onslaught joins a list with a 1,000-point draw
 * from another list of its faction.
 */
import { isKotcLimit } from './battle'

export type Grade = 'A' | 'B' | 'C' | 'D'
export type ReferenceTargetKey = 'horde' | 'elite' | 'vehicle' | 'heavyVehicle' | 'monster'

/** Fixed archetypes every list is measured against, named as the reference data names them. */
export const REFERENCE_TARGETS: readonly {
  key: ReferenceTargetKey
  label: string
  target: string
  /** The target counted, as in "2.4 Rhinos". */
  many: string
  faction: string
  unit: string
  models?: number
}[] = [
  {
    key: 'horde',
    label: 'Clear hordes',
    target: '20 Termagants',
    many: 'squads of 20 Termagants',
    faction: 'tyranids',
    unit: 'Termagants',
    models: 20,
  },
  {
    key: 'elite',
    label: 'Kill elite infantry',
    target: 'a Chaos Terminator Squad',
    many: 'Chaos Terminator Squads',
    faction: 'chaos-space-marines',
    unit: 'Chaos Terminator Squad',
    models: 5,
  },
  { key: 'vehicle', label: 'Kill vehicles', target: 'a Rhino', many: 'Rhinos', faction: 'space-marines', unit: 'Rhino' },
  {
    key: 'heavyVehicle',
    label: 'Kill heavy armour',
    target: 'a Leman Russ Battle Tank',
    many: 'Leman Russ Battle Tanks',
    faction: 'astra-militarum',
    unit: 'Leman Russ Battle Tank',
  },
  {
    key: 'monster',
    label: 'Kill monsters',
    target: 'a Carnifex',
    many: 'Carnifexes',
    faction: 'tyranids',
    unit: 'Carnifexes',
    models: 1,
  },
]

/** Nothing above Toughness 9 is allowed at King of the Colosseum, so heavy armour is never faced there. */
export const gradedTargets = (limit: number) => REFERENCE_TARGETS.filter((target) => target.key !== 'heavyVehicle' || !isKotcLimit(limit))

/** The units every list has to survive a turn of shooting from, named as the reference data names them. */
export const REFERENCE_ATTACKERS = [
  { key: 'intercessors', label: '10 Intercessors', faction: 'space-marines', unit: 'Intercessor Squad', models: 10 },
  {
    key: 'eradicators',
    label: '3 Eradicators with melta rifles',
    faction: 'space-marines',
    unit: 'Eradicator Squad with Melta Rifles',
    models: 3,
  },
] as const

/** Both core deployments and the Colosseum place five objectives. */
export const OBJECTIVES = 5
/** The OC of a five-model squad, which a unit needs to match to contest an objective it holds. */
export const SQUAD_OC = 10
/** Cheap enough to spend on screening, an action or a home objective without leaving a hole. */
export const CHEAP_UNIT_POINTS = 70

export type MetricKey = 'presence' | 'hold' | 'screens' | 'reach' | 'deployment' | ReferenceTargetKey | 'survive' | 'spread'

/** Four groups, each scored from its measures, the way Lighthouse rolls audits into categories. */
export const CATEGORIES: readonly { key: string; label: string; metrics: readonly MetricKey[] }[] = [
  { key: 'control', label: 'Board control', metrics: ['presence', 'hold', 'screens'] },
  { key: 'mobility', label: 'Mobility', metrics: ['reach', 'deployment'] },
  { key: 'damage', label: 'Damage', metrics: ['horde', 'elite', 'vehicle', 'heavyVehicle', 'monster'] },
  { key: 'durability', label: 'Durability', metrics: ['survive', 'spread'] },
]

/** The battle sizes the tournament lists are drawn at; any other limit is compared with the nearest. */
type CalibratedSize = 600 | 1000 | 2000 | 3000

/**
 * Each measure's value at every fifth percentile, 0th to 100th, among the tournament lists of each size, as
 * `rosterGrades` measures them; a list scores the percentile its value reaches. Every value grows the better
 * the list does that job.
 */
const DISTRIBUTION: Record<CalibratedSize, Partial<Record<MetricKey, readonly number[]>>> = {
  600: {
    presence: [1, 2, 3, 3, 3, 3, 4, 4, 4, 4, 4, 4, 4, 5, 5, 5, 5, 5, 6, 6, 9],
    hold: [0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 1, 1, 2, 2, 2, 2, 3, 6],
    screens: [0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 1, 1, 2, 2, 2, 2, 3, 8],
    reach: [0.1, 0.4, 0.48, 0.56, 0.61, 0.67, 0.72, 0.76, 0.8, 0.84, 0.86, 0.89, 0.92, 0.94, 0.95, 0.97, 0.98, 1, 1, 1, 1],
    deployment: [0, 0, 0, 0, 0, 0.12, 0.14, 0.18, 0.24, 0.29, 0.34, 0.41, 0.47, 0.55, 0.63, 0.71, 0.8, 0.88, 1, 1, 1],
    horde: [0.51, 1.07, 1.22, 1.33, 1.43, 1.5, 1.57, 1.64, 1.7, 1.77, 1.84, 1.91, 1.97, 2.03, 2.1, 2.19, 2.28, 2.4, 2.55, 2.77, 4.66],
    elite: [0.26, 0.71, 0.79, 0.85, 0.9, 0.95, 0.99, 1.03, 1.07, 1.11, 1.15, 1.19, 1.23, 1.27, 1.31, 1.35, 1.41, 1.46, 1.54, 1.66, 3.02],
    survive: [0.19, 0.48, 0.52, 0.55, 0.57, 0.59, 0.61, 0.62, 0.64, 0.65, 0.67, 0.68, 0.69, 0.71, 0.72, 0.74, 0.76, 0.78, 0.81, 0.85, 1],
    spread: [0, 0, 0.09, 0.12, 0.14, 0.17, 0.21, 0.23, 0.26, 0.28, 0.3, 0.33, 0.35, 0.38, 0.4, 0.42, 0.45, 0.48, 0.51, 0.56, 0.73],
  },
  1000: {
    presence: [2, 4, 4, 5, 5, 5, 6, 6, 6, 6, 6, 7, 7, 7, 7, 8, 8, 8, 9, 9, 13],
    hold: [0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 1, 2, 2, 2, 2, 2, 3, 3, 3, 4, 9],
    screens: [0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 1, 2, 2, 2, 2, 2, 3, 3, 4, 10],
    reach: [0, 0.24, 0.31, 0.37, 0.41, 0.46, 0.49, 0.53, 0.56, 0.59, 0.62, 0.66, 0.69, 0.72, 0.75, 0.79, 0.83, 0.87, 0.92, 0.97, 1],
    deployment: [0, 0, 0, 0.07, 0.1, 0.15, 0.19, 0.23, 0.28, 0.33, 0.37, 0.42, 0.47, 0.54, 0.59, 0.65, 0.72, 0.82, 0.93, 1, 1],
    horde: [0.84, 1.97, 2.19, 2.34, 2.46, 2.56, 2.65, 2.74, 2.83, 2.93, 3.01, 3.1, 3.19, 3.29, 3.4, 3.51, 3.64, 3.79, 3.98, 4.28, 6.68],
    elite: [0.64, 1.29, 1.43, 1.52, 1.6, 1.67, 1.74, 1.8, 1.86, 1.92, 1.97, 2.03, 2.09, 2.15, 2.21, 2.27, 2.33, 2.42, 2.5, 2.64, 3.81],
    vehicle: [0.87, 2.23, 2.41, 2.56, 2.68, 2.77, 2.86, 2.94, 3.01, 3.08, 3.15, 3.22, 3.3, 3.38, 3.46, 3.56, 3.68, 3.82, 3.98, 4.26, 6.08],
    heavyVehicle: [0.42, 1.21, 1.36, 1.47, 1.55, 1.61, 1.68, 1.74, 1.79, 1.84, 1.9, 1.95, 2, 2.06, 2.12, 2.19, 2.28, 2.38, 2.49, 2.69, 3.8],
    monster: [0.7, 2.05, 2.22, 2.35, 2.45, 2.55, 2.63, 2.7, 2.78, 2.85, 2.92, 2.98, 3.05, 3.13, 3.22, 3.31, 3.42, 3.55, 3.7, 3.96, 5.74],
    survive: [0.31, 0.54, 0.58, 0.6, 0.61, 0.63, 0.64, 0.66, 0.67, 0.68, 0.69, 0.7, 0.71, 0.72, 0.73, 0.74, 0.76, 0.78, 0.8, 0.84, 1],
    spread: [0, 0.21, 0.28, 0.32, 0.35, 0.37, 0.4, 0.41, 0.43, 0.45, 0.46, 0.48, 0.5, 0.52, 0.54, 0.56, 0.58, 0.6, 0.63, 0.66, 0.81],
  },
  2000: {
    presence: [4, 8, 9, 10, 10, 10, 11, 11, 12, 12, 12, 12, 13, 13, 14, 14, 14, 15, 15, 17, 23],
    hold: [0, 0, 1, 1, 1, 2, 2, 2, 3, 3, 3, 3, 3, 4, 4, 4, 4, 5, 5, 6, 15],
    screens: [0, 0, 0, 0, 1, 1, 1, 1, 2, 2, 2, 2, 2, 3, 3, 3, 3, 4, 4, 5, 14],
    reach: [0.05, 0.28, 0.34, 0.38, 0.42, 0.46, 0.49, 0.52, 0.56, 0.59, 0.62, 0.66, 0.69, 0.71, 0.73, 0.76, 0.79, 0.83, 0.86, 0.93, 1],
    deployment: [0, 0, 0.07, 0.1, 0.14, 0.17, 0.21, 0.25, 0.3, 0.34, 0.38, 0.43, 0.48, 0.52, 0.56, 0.61, 0.67, 0.77, 0.85, 1, 1],
    horde: [2.06, 4.19, 4.7, 4.94, 5.12, 5.35, 5.5, 5.69, 5.85, 5.99, 6.13, 6.26, 6.39, 6.52, 6.67, 6.84, 7.04, 7.26, 7.56, 7.9, 11.17],
    elite: [1.95, 2.86, 3.08, 3.28, 3.46, 3.57, 3.69, 3.82, 3.96, 4.06, 4.16, 4.29, 4.4, 4.53, 4.61, 4.7, 4.81, 4.93, 5.05, 5.27, 6.85],
    vehicle: [3.36, 4.87, 5.23, 5.54, 5.74, 5.89, 6, 6.15, 6.27, 6.4, 6.55, 6.65, 6.79, 6.9, 7.03, 7.17, 7.34, 7.58, 7.84, 8.34, 9.97],
    heavyVehicle: [1.61, 2.83, 3.13, 3.34, 3.47, 3.6, 3.69, 3.78, 3.88, 3.96, 4.03, 4.12, 4.2, 4.28, 4.38, 4.5, 4.65, 4.81, 5, 5.34, 6.78],
    monster: [3.02, 4.57, 4.89, 5.12, 5.31, 5.45, 5.57, 5.7, 5.81, 5.93, 6.06, 6.19, 6.3, 6.42, 6.56, 6.71, 6.85, 7.08, 7.28, 7.76, 9.38],
    survive: [0.43, 0.59, 0.62, 0.64, 0.65, 0.66, 0.67, 0.68, 0.69, 0.7, 0.71, 0.72, 0.73, 0.73, 0.75, 0.76, 0.77, 0.79, 0.8, 0.86, 1],
    spread: [0.22, 0.53, 0.56, 0.58, 0.61, 0.62, 0.63, 0.65, 0.65, 0.67, 0.68, 0.69, 0.69, 0.7, 0.71, 0.72, 0.73, 0.75, 0.77, 0.79, 0.87],
  },
  3000: {
    presence: [7, 13, 14, 15, 16, 16, 17, 17, 18, 18, 19, 19, 20, 20, 21, 21, 22, 22, 23, 25, 34],
    hold: [0, 1, 1, 2, 2, 3, 3, 3, 4, 4, 4, 5, 5, 5, 6, 6, 7, 7, 8, 9, 23],
    screens: [0, 0, 1, 1, 2, 2, 2, 2, 3, 3, 3, 4, 4, 4, 5, 5, 5, 6, 6, 8, 21],
    reach: [0.06, 0.32, 0.37, 0.41, 0.44, 0.48, 0.51, 0.54, 0.57, 0.59, 0.62, 0.64, 0.67, 0.69, 0.72, 0.74, 0.77, 0.81, 0.84, 0.9, 1],
    deployment: [0, 0.04, 0.09, 0.13, 0.16, 0.2, 0.24, 0.28, 0.32, 0.36, 0.39, 0.43, 0.47, 0.5, 0.55, 0.59, 0.65, 0.72, 0.84, 0.97, 1],
    horde: [
      3.44, 6.75, 7.23, 7.58, 7.87, 8.13, 8.39, 8.61, 8.81, 8.99, 9.18, 9.37, 9.55, 9.76, 9.97, 10.18, 10.44, 10.73, 11.08, 11.63, 15.49,
    ],
    elite: [2.85, 4.34, 4.66, 4.94, 5.18, 5.38, 5.57, 5.75, 5.89, 6.04, 6.17, 6.31, 6.45, 6.59, 6.72, 6.86, 7.02, 7.18, 7.38, 7.71, 9.57],
    vehicle: [
      4.56, 7.67, 8.13, 8.44, 8.68, 8.88, 9.06, 9.23, 9.39, 9.54, 9.71, 9.86, 10.03, 10.19, 10.38, 10.59, 10.81, 11.08, 11.44, 12.01, 15.11,
    ],
    heavyVehicle: [
      2.52, 4.39, 4.79, 5.04, 5.2, 5.36, 5.48, 5.6, 5.71, 5.83, 5.94, 6.05, 6.17, 6.3, 6.45, 6.6, 6.78, 6.97, 7.21, 7.58, 10.09,
    ],
    monster: [
      4.18, 7.07, 7.54, 7.81, 8.03, 8.21, 8.36, 8.52, 8.68, 8.83, 8.99, 9.15, 9.31, 9.48, 9.66, 9.84, 10.06, 10.31, 10.65, 11.15, 13.89,
    ],
    survive: [0.43, 0.6, 0.62, 0.64, 0.65, 0.66, 0.67, 0.68, 0.68, 0.69, 0.7, 0.71, 0.71, 0.72, 0.73, 0.74, 0.75, 0.77, 0.78, 0.81, 1],
    spread: [0.46, 0.66, 0.69, 0.71, 0.72, 0.73, 0.74, 0.75, 0.75, 0.76, 0.77, 0.77, 0.78, 0.78, 0.79, 0.8, 0.8, 0.81, 0.83, 0.84, 0.9],
  },
}

/** The targets at least nine in ten tournament lists of each size have a unit to take half of alone, so lacking one is worth naming. */
const EXPECTED_TOOLS: Record<CalibratedSize, readonly ReferenceTargetKey[]> = {
  600: ['vehicle', 'monster'],
  1000: ['horde', 'vehicle', 'monster'],
  2000: ['horde', 'elite', 'vehicle', 'heavyVehicle', 'monster'],
  3000: ['horde', 'elite', 'vehicle', 'heavyVehicle', 'monster'],
}

const calibratedSize = (limit: number): CalibratedSize =>
  isKotcLimit(limit)
    ? 600
    : ([1000, 2000, 3000] as const).reduce((nearest, size) => (Math.abs(size - limit) < Math.abs(nearest - limit) ? size : nearest))

export type GradedUnit = {
  name: string
  points: number
  move: number
  objectiveControl: number
  /** Whether every model in the unit, attachments included, has Deep Strike or Infiltrators. */
  deepStrike: boolean
  infiltrators: boolean
  /** The Scouts move every model in the unit has, or 0. */
  scouts: number
  chargeBonus: number
  /** Per target: the share of its wounds the unit alone takes in a turn, up to 1, or null when the simulator cannot say. */
  removes: Partial<Record<ReferenceTargetKey, number | null>>
  /** The share of the unit's wounds a turn of the reference attackers' shooting takes on average, or null when it cannot be calculated. */
  volleyLoss: number | null
}

export type GradeRow = {
  key: MetricKey
  label: string
  /** 0 to 100: the share of tournament lists of this size this one matches or beats on the measure, or a score the table sets. */
  score: number | null
  grade: Grade | null
  detail: string
  units?: string[]
  notCalculated?: string[]
}

export type GradeCategory = { key: string; label: string; score: number | null; grade: Grade | null; rows: GradeRow[] }

/** `missing` names each reference target nothing in the list can take half of on its own, as in "a Rhino". */
export type RosterGrades = { score: number | null; grade: Grade | null; categories: GradeCategory[]; missing: string[] }

/** A, B, C and D split the tournament lists at their 75th, 40th and 10th percentiles. */
export const gradeOf = (score: number | null): Grade | null =>
  score === null ? null : score >= 75 ? 'A' : score >= 40 ? 'B' : score >= 10 ? 'C' : 'D'

/** The percentile a value reaches among the tournament lists; a value many lists share takes the middle of their run. */
export function percentileOf(value: number, quantiles: readonly number[]) {
  const step = 100 / (quantiles.length - 1)
  const first = quantiles.findIndex((quantile) => quantile >= value)
  if (first === -1) return 100
  if (quantiles[first] === value) {
    const last = quantiles.findLastIndex((quantile) => quantile === value)
    return ((first + last) / 2) * step
  }
  if (first === 0) return 0
  const below = quantiles[first - 1]!
  return (first - 1 + (value - below) / (quantiles[first]! - below)) * step
}

/**
 * Every measure counts the same within its category, and every category the same overall. Within one faction,
 * no measure separated lists that placed in the top four from the rest of their events by as much as a fifth
 * of a standard deviation, too little to weight one job above another.
 */
const mean = (scores: readonly (number | null)[]) => {
  const scored = scores.filter((score) => score !== null)
  return scored.length ? scored.reduce((total, score) => total + score, 0) / scored.length : null
}

const twoDice = (needed: number) => {
  if (needed <= 2) return 1
  let ways = 0
  for (let first = 1; first <= 6; first++) for (let second = 1; second <= 6; second++) if (first + second >= needed) ways++
  return ways / 36
}

/** Gap between the deployment zones a unit must close: the Colosseum's 36″ board leaves 20″, the core deployments 24″. */
export const deploymentGap = (limit: number) => (isKotcLimit(limit) ? 20 : 24)

/**
 * The chance a unit can charge an enemy standing at the edge of its own deployment zone in battle round one or two.
 *
 * It moves its full Move each round with no Advance; Scouts and Infiltrators shorten the gap before the first
 * turn, and Deep Strike sets it up 9″ away in round two. Terrain and the opponent's own moves are ignored.
 */
export function reachChance(unit: Pick<GradedUnit, 'move' | 'deepStrike' | 'infiltrators' | 'scouts' | 'chargeBonus'>, gap: number) {
  const start = Math.min(gap - unit.scouts, unit.infiltrators ? 9 : gap)
  const walking = Math.max(twoDice(start - unit.move - unit.chargeBonus), twoDice(start - 2 * unit.move - unit.chargeBonus))
  return unit.deepStrike ? Math.max(walking, twoDice(9 - unit.chargeBonus)) : walking
}

const deploysEarly = (unit: GradedUnit) => unit.deepStrike || unit.infiltrators || unit.scouts > 0
const percent = (value: number) => `${Math.round(value * 100)}%`
const unitCount = (count: number) => `${count} ${count === 1 ? 'unit' : 'units'}`
/** The units' points-weighted average of a value, so a cheap unit sways it no more than its cost. */
const byPoints = (units: readonly GradedUnit[], value: (unit: GradedUnit) => number) => {
  const total = units.reduce((sum, unit) => sum + unit.points, 0)
  return total ? units.reduce((sum, unit) => sum + unit.points * value(unit), 0) / total : 0
}

function row(key: MetricKey, label: string, score: number | null, detail: string, extra: Partial<GradeRow> = {}): GradeRow {
  const rounded = score === null ? null : Math.round(Math.min(100, Math.max(0, score)))
  return { key, label, score: rounded, grade: gradeOf(rounded), detail, ...extra }
}

/** The values each measure compares, every one higher for a list that does the job better. */
function gradeMeasures(units: readonly GradedUnit[], limit: number) {
  const gap = deploymentGap(limit)
  const measured = units.filter((unit) => unit.volleyLoss !== null)
  const total = units.reduce((sum, unit) => sum + unit.points, 0)
  const [first = 0, second = 0] = units.map((unit) => unit.points).toSorted((left, right) => right - left)
  return {
    presence: units.length,
    hold: units.filter((unit) => unit.objectiveControl >= SQUAD_OC).length,
    screens: units.filter((unit) => unit.points > 0 && unit.points <= CHEAP_UNIT_POINTS).length,
    reach: byPoints(units, (unit) => reachChance(unit, gap)),
    deployment: byPoints(units, (unit) => (deploysEarly(unit) ? 1 : 0)),
    ...(Object.fromEntries(
      gradedTargets(limit).map((target) => [target.key, units.reduce((sum, unit) => sum + (unit.removes[target.key] ?? 0), 0)]),
    ) as Partial<Record<ReferenceTargetKey, number>>),
    survive: measured.length ? 1 - byPoints(measured, (unit) => unit.volleyLoss!) : null,
    spread: total ? 1 - (first + second) / total : null,
  } satisfies Partial<Record<MetricKey, number | null>>
}

/** The grades for a roster's units, each a unit and everything attached to it. */
export function rosterGrades(units: readonly GradedUnit[], limit: number): RosterGrades {
  const size = calibratedSize(limit)
  const measures = gradeMeasures(units, limit)
  const score = (key: MetricKey, value: number | null | undefined) => {
    const quantiles = DISTRIBUTION[size][key]
    return quantiles && value !== null && value !== undefined && units.length ? percentileOf(value, quantiles) : null
  }
  const named = (chosen: readonly GradedUnit[]) => chosen.map((unit) => unit.name)
  const holders = units.filter((unit) => unit.objectiveControl >= SQUAD_OC)
  const cheap = units.filter((unit) => unit.points > 0 && unit.points <= CHEAP_UNIT_POINTS)
  const early = units.filter(deploysEarly)
  const gap = deploymentGap(limit)
  const rows: GradeRow[] = [
    row('presence', 'Board presence', score('presence', measures.presence), `${unitCount(units.length)} for ${OBJECTIVES} objectives`),
    row(
      'hold',
      'Hold objectives',
      score('hold', measures.hold),
      `${unitCount(holders.length)} with OC ${SQUAD_OC} or more, enough to contest a five-model squad`,
      { units: named(holders) },
    ),
    row(
      'screens',
      'Screens and actions',
      score('screens', measures.screens),
      `${unitCount(cheap.length)} at ${CHEAP_UNIT_POINTS} points or less, cheap enough to screen or do actions`,
      { units: named(cheap) },
    ),
    row(
      'reach',
      'Reach',
      score('reach', measures.reach),
      `${percent(measures.reach)} of your points can charge across the ${gap}″ gap by round two, on average`,
    ),
    row(
      'deployment',
      'Deployment options',
      score('deployment', measures.deployment),
      `${percent(measures.deployment)} of your points can deep strike, infiltrate or scout`,
      { units: named(early) },
    ),
  ]
  const missing: string[] = []
  for (const target of gradedTargets(limit)) {
    const removed = measures[target.key] ?? 0
    const alone = units.filter((unit) => (unit.removes[target.key] ?? 0) >= 0.5)
    const notCalculated = named(units.filter((unit) => unit.removes[target.key] === null))
    // The Colosseum allows one Toughness 9 unit a side, so removing one covers it and a second is a spare.
    const capped = isKotcLimit(limit) && (target.key === 'vehicle' || target.key === 'monster')
    const value = capped ? 60 * Math.min(removed, 1) + 40 * Math.min(Math.max(removed - 1, 0), 1) : score(target.key, removed)
    rows.push(
      row(
        target.key,
        target.label,
        // Units the simulator cannot calculate could only add to the total, so a total of nothing beside them is no score.
        removed > 0 || !notCalculated.length ? value : null,
        `Your units together remove ${removed.toFixed(1)} ${target.many} a turn${alone.length ? '. These take half of one alone:' : ''}`,
        { units: named(alone), ...(notCalculated.length ? { notCalculated } : {}) },
      ),
    )
    if (!alone.length && !notCalculated.length && EXPECTED_TOOLS[size].includes(target.key)) missing.push(target.target)
  }
  const unknown = named(units.filter((unit) => unit.volleyLoss === null))
  rows.push(
    row(
      'survive',
      'Survive a volley',
      score('survive', measures.survive),
      measures.survive === null
        ? 'No unit could be measured against a volley'
        : `A volley from ${formatAttackers()} takes ${percent(1 - measures.survive)} of a unit's wounds, on average by points`,
      unknown.length ? { notCalculated: unknown } : {},
    ),
    row(
      'spread',
      'Even spread',
      score('spread', measures.spread),
      `Your two costliest units are ${percent(1 - (measures.spread ?? 1))} of the points`,
    ),
  )
  const categories = CATEGORIES.map((category) => {
    const members = rows.filter((candidate) => category.metrics.includes(candidate.key))
    const average = mean(members.map((member) => member.score))
    const rounded = average === null ? null : Math.round(average)
    return { key: category.key, label: category.label, score: rounded, grade: gradeOf(rounded), rows: members }
  })
  const overall = mean(categories.map((category) => category.score))
  const total = overall === null ? null : Math.round(overall)
  return { score: total, grade: gradeOf(total), categories, missing }
}

const formatAttackers = () => REFERENCE_ATTACKERS.map((attacker) => attacker.label).join(' or ')

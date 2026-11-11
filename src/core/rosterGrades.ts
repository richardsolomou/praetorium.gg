/**
 * Roster grades: what a roster can do on the table, scored 0–100 and graded A–D, never a prediction of who wins.
 *
 * Like Lighthouse, each measure scores the percentile it reaches among real examples: 3,006 11th-edition
 * tournament lists (2,000 points, events from 20 June to 8 November 2026) that import cleanly, of which only
 * these percentiles are kept. Measures the table fixes, such as how many units work five objectives, are
 * scored from the mission instead, so they hold at every battle size.
 */
import { isKotcLimit } from './battle'

export type Grade = 'A' | 'B' | 'C' | 'D'
export type ReferenceTargetKey = 'horde' | 'elite' | 'vehicle' | 'heavyVehicle' | 'monster'

/** Fixed archetypes every list is measured against, named as the reference data names them. */
export const REFERENCE_TARGETS: readonly {
  key: ReferenceTargetKey
  label: string
  target: string
  faction: string
  unit: string
  models?: number
}[] = [
  { key: 'horde', label: 'Clear hordes', target: '20 Termagants', faction: 'tyranids', unit: 'Termagants', models: 20 },
  {
    key: 'elite',
    label: 'Kill elite infantry',
    target: 'a Chaos Terminator Squad',
    faction: 'chaos-space-marines',
    unit: 'Chaos Terminator Squad',
    models: 5,
  },
  { key: 'vehicle', label: 'Kill vehicles', target: 'a Rhino', faction: 'space-marines', unit: 'Rhino' },
  {
    key: 'heavyVehicle',
    label: 'Kill heavy armour',
    target: 'a Leman Russ Battle Tank',
    faction: 'astra-militarum',
    unit: 'Leman Russ Battle Tank',
  },
  { key: 'monster', label: 'Kill monsters', target: 'a Carnifex', faction: 'tyranids', unit: 'Carnifexes', models: 1 },
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

/**
 * Each measure's value at every fifth percentile, 0th to 100th, across the tournament lists above, measured
 * by `measureRosterUnits`; a list scores the percentile its value reaches. Every measure is a share of the
 * list's units, so it holds at every battle size.
 */
const DISTRIBUTION: Partial<Record<MetricKey, readonly number[]>> = {
  hold: [0, 0, 0.067, 0.083, 0.125, 0.143, 0.167, 0.182, 0.2, 0.222, 0.25, 0.267, 0.286, 0.308, 0.333, 0.364, 0.4, 0.438, 0.5, 0.6, 1],
  screens: [0, 0, 0, 0, 0.067, 0.077, 0.091, 0.111, 0.143, 0.154, 0.167, 0.176, 0.182, 0.2, 0.222, 0.235, 0.267, 0.286, 0.333, 0.375, 0.7],
  reach: [
    0.06, 0.338, 0.399, 0.444, 0.478, 0.502, 0.53, 0.558, 0.589, 0.611, 0.639, 0.665, 0.692, 0.714, 0.736, 0.767, 0.792, 0.818, 0.85, 0.915,
    1,
  ],
  deployment: [
    0, 0, 0.091, 0.154, 0.188, 0.222, 0.25, 0.286, 0.308, 0.357, 0.4, 0.417, 0.455, 0.5, 0.538, 0.583, 0.636, 0.733, 0.846, 1, 1,
  ],
  horde: [0, 0.143, 0.2, 0.231, 0.273, 0.308, 0.333, 0.364, 0.385, 0.417, 0.429, 0.455, 0.5, 0.5, 0.545, 0.571, 0.615, 0.667, 0.7, 0.8, 1],
  elite: [0, 0, 0.067, 0.077, 0.111, 0.143, 0.167, 0.188, 0.214, 0.231, 0.25, 0.273, 0.308, 0.333, 0.364, 0.4, 0.444, 0.5, 0.556, 0.636, 1],
  vehicle: [
    0, 0.25, 0.333, 0.385, 0.429, 0.455, 0.474, 0.5, 0.533, 0.545, 0.571, 0.583, 0.6, 0.625, 0.636, 0.667, 0.692, 0.727, 0.769, 0.857, 1,
  ],
  heavyVehicle: [
    0, 0.056, 0.071, 0.105, 0.143, 0.167, 0.188, 0.214, 0.231, 0.25, 0.273, 0.3, 0.308, 0.333, 0.364, 0.385, 0.417, 0.455, 0.5, 0.6, 1,
  ],
  monster: [
    0, 0.2, 0.286, 0.312, 0.357, 0.385, 0.412, 0.429, 0.455, 0.467, 0.5, 0.533, 0.545, 0.571, 0.583, 0.6, 0.636, 0.667, 0.714, 0.778, 1,
  ],
  survive: [0.286, 0.6, 0.667, 0.7, 0.727, 0.75, 0.769, 0.8, 0.818, 0.833, 0.846, 0.857, 0.889, 0.909, 0.917, 0.929, 1, 1, 1, 1, 1],
}

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
  /** Per target: whether the unit alone takes at least half its wounds in a turn, or null when the simulator cannot say. */
  removes: Partial<Record<ReferenceTargetKey, boolean | null>>
  /** Whether it stands through a turn of each reference attacker's shooting at least half the time, or null when it cannot be calculated. */
  survives: boolean | null
}

export type GradeRow = {
  key: MetricKey
  label: string
  /** 0 to 100: the share of tournament lists this one matches or beats on the measure, or a score the table sets. */
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

/** A straight line through each `[value, score]` point, held flat past the ends. */
function piecewise(value: number, points: readonly (readonly [number, number])[]) {
  const after = points.findIndex(([at]) => at >= value)
  if (after === -1) return points.at(-1)![1]
  if (after === 0) return points[0]![1]
  const [x0, y0] = points[after - 1]!
  const [x1, y1] = points[after]!
  return y0 + ((value - x0) / (x1 - x0)) * (y1 - y0)
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
const ofUnits = (count: number, total: number) => `${count} of ${total} ${total === 1 ? 'unit' : 'units'}`

function row(key: MetricKey, label: string, score: number | null, detail: string, extra: Partial<GradeRow> = {}): GradeRow {
  const rounded = score === null ? null : Math.round(Math.min(100, Math.max(0, score)))
  return { key, label, score: rounded, grade: gradeOf(rounded), detail, ...extra }
}

const share = (key: MetricKey, value: number) => {
  const quantiles = DISTRIBUTION[key]
  return quantiles ? percentileOf(value, quantiles) : null
}

/** The grades for a roster's units, each a unit and everything attached to it. */
export function rosterGrades(units: readonly GradedUnit[], limit: number): RosterGrades {
  const total = units.reduce((sum, unit) => sum + unit.points, 0)
  const count = units.length
  const rows: GradeRow[] = []
  // Five objectives want a unit each, and three more to screen, act and trade.
  rows.push(
    row(
      'presence',
      'Board presence',
      piecewise(count, [
        [3, 0],
        [4, 5],
        [5, 25],
        [6, 55],
        [7, 70],
        [8, 100],
      ]),
      `${unitCount(count)} to hold and contest ${OBJECTIVES} objectives`,
    ),
  )
  const holders = units.filter((unit) => unit.objectiveControl >= SQUAD_OC)
  rows.push(
    row(
      'hold',
      'Hold objectives',
      count ? share('hold', holders.length / count) : null,
      `${ofUnits(holders.length, count)} have OC ${SQUAD_OC} or more, enough to contest a five-model squad`,
      {
        units: holders.map((unit) => unit.name),
      },
    ),
  )
  const cheap = units.filter((unit) => unit.points > 0 && unit.points <= CHEAP_UNIT_POINTS)
  rows.push(
    row(
      'screens',
      'Screens and actions',
      count ? share('screens', cheap.length / count) : null,
      `${ofUnits(cheap.length, count)} cost ${CHEAP_UNIT_POINTS} points or less, cheap enough to screen or do actions`,
      {
        units: cheap.map((unit) => unit.name),
      },
    ),
  )
  const gap = deploymentGap(limit)
  const reach = count ? units.reduce((sum, unit) => sum + reachChance(unit, gap), 0) / count : 0
  rows.push(
    row(
      'reach',
      'Reach',
      count ? share('reach', reach) : null,
      `${percent(reach)} average chance to charge across the ${gap}″ gap by round two`,
    ),
  )
  const early = units.filter(deploysEarly)
  rows.push(
    row(
      'deployment',
      'Deployment options',
      count ? share('deployment', early.length / count) : null,
      `${ofUnits(early.length, count)} can deep strike, infiltrate or scout`,
      {
        units: early.map((unit) => unit.name),
      },
    ),
  )
  const missing: string[] = []
  for (const target of gradedTargets(limit)) {
    const tools = units.filter((unit) => unit.removes[target.key])
    const notCalculated = units.filter((unit) => unit.removes[target.key] === null).map((unit) => unit.name)
    // The Colosseum allows one Toughness 9 unit a side, so one killer covers it and a second is a spare.
    const capped = isKotcLimit(limit) && (target.key === 'vehicle' || target.key === 'monster')
    const score = capped ? [0, 60, 100][Math.min(tools.length, 2)]! : count ? share(target.key, tools.length / count) : null
    rows.push(
      row(
        target.key,
        target.label,
        tools.length || !notCalculated.length ? score : null,
        `${tools.length === 0 ? 'No unit can' : tools.length === 1 ? '1 unit can' : `${tools.length} units can each`} take half the wounds of ${target.target} in a turn`,
        { units: tools.map((unit) => unit.name), ...(notCalculated.length ? { notCalculated } : {}) },
      ),
    )
    // At least 95% of the tournament lists have a unit for each target, so lacking one is worth naming.
    if (!tools.length && !notCalculated.length) missing.push(target.target)
  }
  const standing = units.filter((unit) => unit.survives)
  const unknown = units.filter((unit) => unit.survives === null).map((unit) => unit.name)
  const known = count - unknown.length
  rows.push(
    row(
      'survive',
      'Survive a volley',
      known ? share('survive', standing.length / known) : null,
      `${ofUnits(standing.length, known)} stand through a turn of shooting from ${formatAttackers()} at least half the time`,
      { units: standing.map((unit) => unit.name), ...(unknown.length ? { notCalculated: unknown } : {}) },
    ),
  )
  const [first = 0, second = 0] = units.map((unit) => unit.points).toSorted((left, right) => right - left)
  const concentration = total ? (first + second) / total : 0
  rows.push(
    row(
      'spread',
      'Even spread',
      count
        ? piecewise(concentration, [
            [0.3, 100],
            [0.4, 75],
            [0.5, 40],
            [0.6, 10],
            [0.65, 0],
          ])
        : null,
      `Your two costliest units are ${percent(concentration)} of the points`,
    ),
  )
  const categories = CATEGORIES.map((category) => {
    const members = rows.filter((candidate) => category.metrics.includes(candidate.key))
    const score = mean(members.map((member) => member.score))
    const rounded = score === null ? null : Math.round(score)
    return { key: category.key, label: category.label, score: rounded, grade: gradeOf(rounded), rows: members }
  })
  const overall = mean(categories.map((category) => category.score))
  const score = overall === null ? null : Math.round(overall)
  return { score, grade: gradeOf(score), categories, missing }
}

const formatAttackers = () => REFERENCE_ATTACKERS.map((attacker) => attacker.label).join(' or ')

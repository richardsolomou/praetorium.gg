/**
 * Roster grades: what a roster can do on the table, graded A–D row by row, never a chance to win.
 *
 * Rows that scale with the list are graded against the 10th, 40th and 75th percentiles of 3,006
 * 11th-edition tournament lists (2,000 points, events from 20 June to 8 November 2026) that import
 * cleanly; only these aggregate cut-offs are kept. Rows the table fixes, such as how many units
 * work five objectives, are graded from the mission instead, so they hold at every battle size.
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

// Share of a list's units that alone take half a reference target's wounds in one turn.
const TOOL_CUTS: Record<ReferenceTargetKey, readonly [number, number, number]> = {
  horde: [0.2, 0.385, 0.571],
  elite: [0.067, 0.214, 0.4],
  vehicle: [0.333, 0.533, 0.667],
  heavyVehicle: [0.071, 0.231, 0.385],
  monster: [0.286, 0.455, 0.6],
}
const REACH_CUTS = [0.4, 0.59, 0.78] as const
const DEPLOYMENT_CUTS = [0.11, 0.33, 0.59] as const

/** Both core deployments and the Colosseum place five objectives. */
export const OBJECTIVES = 5

export type GradedUnit = {
  name: string
  points: number
  move: number
  coreAbilities: readonly string[]
  /** Per target: whether the unit alone takes at least half its wounds in a turn, or null when the simulator cannot say. */
  removes: Partial<Record<ReferenceTargetKey, boolean | null>>
}

export type GradeRow = {
  key: string
  label: string
  grade: Grade | null
  detail: string
  units?: string[]
  notCalculated?: string[]
}

export type RosterGrades = { rows: GradeRow[]; missing: string[] }

const percentGrade = (value: number, [d, c, b]: readonly [number, number, number]): Grade =>
  value < d ? 'D' : value < c ? 'C' : value < b ? 'B' : 'A'

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
export function reachChance(coreAbilities: readonly string[], move: number, gap: number) {
  let start = gap
  for (const name of coreAbilities) {
    const scouts = /Scouts (\d+)/i.exec(name)
    if (scouts) start = Math.min(start, gap - Number(scouts[1]))
    if (/^Infiltrators$/i.test(name)) start = Math.min(start, 9)
  }
  const bonus = Math.max(0, ...coreAbilities.map((name) => Number(/\+(\d+) to charge/i.exec(name)?.[1] ?? 0)))
  const walking = Math.max(twoDice(start - move - bonus), twoDice(start - 2 * move - bonus))
  return coreAbilities.some((name) => /^Deep Strike$/i.test(name)) ? Math.max(walking, twoDice(9 - bonus)) : walking
}

const deploysEarly = (unit: GradedUnit) => unit.coreAbilities.some((name) => /^(Deep Strike|Infiltrators|Scouts\b)/i.test(name))
const percent = (value: number) => `${Math.round(value * 100)}%`
const unitCount = (count: number) => `${count} ${count === 1 ? 'unit' : 'units'}`

/** The graded card for a roster's units, each a unit and everything attached to it. */
export function rosterGrades(units: readonly GradedUnit[], limit: number): RosterGrades {
  const total = units.reduce((sum, unit) => sum + unit.points, 0)
  const rows: GradeRow[] = []
  const count = units.length
  rows.push({
    key: 'presence',
    label: 'Board presence',
    grade: count >= OBJECTIVES + 3 ? 'A' : count > OBJECTIVES ? 'B' : count === OBJECTIVES ? 'C' : 'D',
    detail: `${unitCount(count)} to hold and contest ${OBJECTIVES} objectives`,
  })
  const [first = 0, second = 0] = units.map((unit) => unit.points).toSorted((left, right) => right - left)
  const share = total ? (first + second) / total : 0
  rows.push({
    key: 'spread',
    label: 'Even spread',
    grade: share < 0.4 ? 'A' : share < 0.5 ? 'B' : share < 0.6 ? 'C' : 'D',
    detail: `Your two costliest units are ${percent(share)} of the points`,
  })
  const gap = deploymentGap(limit)
  const reach = count ? units.reduce((sum, unit) => sum + reachChance(unit.coreAbilities, unit.move, gap), 0) / count : 0
  rows.push({
    key: 'reach',
    label: 'Reach',
    grade: count ? percentGrade(reach, REACH_CUTS) : null,
    detail: `${percent(reach)} average chance to charge across the ${gap}″ gap by round two`,
  })
  const early = units.filter(deploysEarly)
  rows.push({
    key: 'deployment',
    label: 'Deployment options',
    grade: count ? percentGrade(early.length / count, DEPLOYMENT_CUTS) : null,
    detail: `${unitCount(early.length)} can deep strike, infiltrate or scout`,
    units: early.map((unit) => unit.name),
  })
  const missing: string[] = []
  for (const target of gradedTargets(limit)) {
    const tools = units.filter((unit) => unit.removes[target.key])
    const notCalculated = units.filter((unit) => unit.removes[target.key] === null).map((unit) => unit.name)
    // The Colosseum allows one Toughness 9 unit a side, so one killer covers it and a second is a spare.
    const capped = isKotcLimit(limit) && (target.key === 'vehicle' || target.key === 'monster')
    const grade: Grade = capped
      ? tools.length >= 2
        ? 'A'
        : tools.length
          ? 'B'
          : 'D'
      : percentGrade(count ? tools.length / count : 0, TOOL_CUTS[target.key])
    rows.push({
      key: target.key,
      label: target.label,
      grade: tools.length || !notCalculated.length ? grade : null,
      detail: `${
        tools.length === 0 ? 'No unit can' : tools.length === 1 ? '1 unit can' : `${tools.length} units can each`
      } take half the wounds of ${target.target} in a turn`,
      units: tools.map((unit) => unit.name),
      ...(notCalculated.length ? { notCalculated } : {}),
    })
    // At least 95% of the tournament lists have a unit for each target, so lacking one is worth naming.
    if (!tools.length && !notCalculated.length) missing.push(`Nothing in this list can take half the wounds of ${target.target} on its own`)
  }
  return { rows, missing }
}

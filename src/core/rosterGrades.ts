/**
 * Roster grades: what a roster can do on the table, scored 0–100 and graded A–D, never a prediction of who wins.
 *
 * Like Lighthouse, each measure scores the percentile it reaches among real examples, tournament lists of the
 * same battle size (see `rosterGradeCalibration`), so it reads the same for every army. Categories and the
 * overall score place the list among its own faction's tournament lists instead, since the simulator's blind
 * spots, such as stratagems and conditional rules, fall unevenly across factions.
 */
import { isKotcLimit } from './battle'
import { EXPECTED_TOOLS, PEERS, type CalibratedSize } from './rosterGradeCalibration'

export type Grade = 'A' | 'B' | 'C' | 'D'
export type ReferenceTargetKey = 'horde' | 'elite' | 'vehicle' | 'heavyVehicle' | 'monster'

/** Fixed archetypes every list is measured against, named as the reference data names them. */
export const REFERENCE_TARGETS: readonly {
  key: ReferenceTargetKey
  label: string
  target: string
  /** The target counted, as in "2.4 Rhinos". */
  many: string
  /**
   * How many of the target a unit is measured against at once, so it can be credited with more than one; the
   * horde stays one squad, since Blast adds attacks for every five models in the target.
   */
  copies: number
  faction: string
  unit: string
  models?: number
}[] = [
  {
    key: 'horde',
    label: 'Clear hordes',
    target: '20 Termagants',
    many: 'squads of 20 Termagants',
    copies: 1,
    faction: 'tyranids',
    unit: 'Termagants',
    models: 20,
  },
  {
    key: 'elite',
    label: 'Kill elite infantry',
    target: 'a Chaos Terminator Squad',
    many: 'Chaos Terminator Squads',
    copies: 3,
    faction: 'chaos-space-marines',
    unit: 'Chaos Terminator Squad',
    models: 5,
  },
  { key: 'vehicle', label: 'Kill vehicles', target: 'a Rhino', many: 'Rhinos', copies: 3, faction: 'space-marines', unit: 'Rhino' },
  {
    key: 'heavyVehicle',
    label: 'Kill heavy armour',
    target: 'a Leman Russ Battle Tank',
    many: 'Leman Russ Battle Tanks',
    copies: 3,
    faction: 'astra-militarum',
    unit: 'Leman Russ Battle Tank',
  },
  {
    key: 'monster',
    label: 'Kill monsters',
    target: 'a Carnifex',
    many: 'Carnifexes',
    copies: 3,
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

export type MetricKey =
  | 'presence'
  | 'hold'
  | 'screens'
  | 'generation'
  | 'movement'
  | 'reach'
  | 'deployment'
  | ReferenceTargetKey
  | 'survive'
  | 'spread'

/** Four groups, each scored from its measures, the way Lighthouse rolls audits into categories. */
export const CATEGORIES: readonly { key: string; label: string; metrics: readonly MetricKey[] }[] = [
  { key: 'control', label: 'Board control', metrics: ['presence', 'hold', 'screens', 'generation'] },
  { key: 'mobility', label: 'Charge & deployment', metrics: ['reach', 'deployment', 'movement'] },
  { key: 'damage', label: 'Damage', metrics: ['horde', 'elite', 'vehicle', 'heavyVehicle', 'monster'] },
  { key: 'durability', label: 'Durability', metrics: ['survive', 'spread'] },
]

const calibratedSize = (limit: number): CalibratedSize =>
  isKotcLimit(limit)
    ? 600
    : ([1000, 2000, 3000] as const).reduce((nearest, size) => (Math.abs(size - limit) < Math.abs(nearest - limit) ? size : nearest))

export type GradedUnit = {
  name: string
  points: number
  move: number
  objectiveControl: number | null
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
  unitGeneration?: UnitGeneration[]
  movementTools?: string[]
}

/** Facts about creating a new unit, never an estimate of how many will be created or survive. */
export type UnitGeneration = { unit: string; trigger: 'shooting' | 'kill'; shared: boolean }

export type GradeRow = {
  key: MetricKey
  label: string
  /** 0 to 100: where the list places among its peers' tournament lists on the measure, on the curve `scaled` draws. */
  score: number | null
  grade: Grade | null
  detail: string
  units?: string[]
  notCalculated?: string[]
}

export type GradeCategory = { key: string; label: string; score: number | null; grade: Grade | null; rows: GradeRow[] }

/**
 * `missing` names each reference target nothing in the list can take half of on its own, as in "a Rhino";
 * `comparedWith` names the tournament lists its scores place it among, such as "Necrons" or, for a chapter with
 * too few of its own, "Adeptus Astartes", or is null when it is placed among every faction's.
 */
export type RosterGrades = {
  score: number | null
  grade: Grade | null
  categories: GradeCategory[]
  missing: string[]
  comparedWith: string | null
}

/**
 * A score from a percentile among tournament lists: a typical one scores 70, the top tenth 90 or more and the
 * bottom tenth under 40, so a list a player would take to an event reads as good rather than as a coin flip.
 */
export const scaled = (percentile: number) =>
  piecewise(percentile, [
    [0, 0],
    [10, 40],
    [50, 70],
    [90, 90],
    [100, 100],
  ])

/** A is the top fifth of tournament lists, B down to about their 43rd percentile, C down to the 10th, and D below. */
export const gradeOf = (score: number | null): Grade | null =>
  score === null ? null : score >= 85 ? 'A' : score >= 65 ? 'B' : score >= 40 ? 'C' : 'D'

/** A straight line through each `[value, score]` point, held flat past the ends. */
function piecewise(value: number, points: readonly (readonly [number, number])[]) {
  const at = Math.min(Math.max(value, points[0]![0]), points.at(-1)![0])
  const after = Math.max(
    1,
    points.findIndex(([x]) => x >= at),
  )
  const [x0, y0] = points[after - 1]!
  const [x1, y1] = points[after]!
  return y0 + ((at - x0) / (x1 - x0)) * (y1 - y0)
}

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

const display = (percentile: number | null) => (percentile === null ? null : Math.round(scaled(percentile)))

/** The values each measure compares, every one higher for a list that does the job better. */
function gradeMeasures(units: readonly GradedUnit[], limit: number) {
  const gap = deploymentGap(limit)
  const measured = units.filter((unit) => unit.volleyLoss !== null)
  const total = units.reduce((sum, unit) => sum + unit.points, 0)
  const [first = 0, second = 0] = units.map((unit) => unit.points).toSorted((left, right) => right - left)
  return {
    presence: units.length,
    hold: units.some((unit) => unit.objectiveControl !== null)
      ? units.filter((unit) => unit.objectiveControl !== null && unit.objectiveControl >= SQUAD_OC).length
      : null,
    screens: units.filter((unit) => unit.points > 0 && unit.points <= CHEAP_UNIT_POINTS).length,
    reach: byPoints(units, (unit) => reachChance(unit, gap)),
    deployment: byPoints(units, (unit) => (deploysEarly(unit) ? 1 : 0)),
    ...(Object.fromEntries(
      gradedTargets(limit).map((target) => [
        target.key,
        // The Colosseum allows one Toughness 9 unit a side, so a third unit that could remove one has nothing to do.
        colosseumCapped(limit, target.key)
          ? Math.min(
              2,
              units.reduce((sum, unit) => sum + Math.min(1, unit.removes[target.key] ?? 0), 0),
            )
          : units.reduce((sum, unit) => sum + (unit.removes[target.key] ?? 0), 0),
      ]),
    ) as Partial<Record<ReferenceTargetKey, number>>),
    survive: measured.length ? 1 - byPoints(measured, (unit) => unit.volleyLoss!) : null,
    spread: total ? 1 - (first + second) / total : null,
  } satisfies Partial<Record<MetricKey, number | null>>
}

const colosseumCapped = (limit: number, key: ReferenceTargetKey) => isKotcLimit(limit) && (key === 'vehicle' || key === 'monster')

/**
 * The catalogue's own tournament lists, then its parent's, as "Imperium - Adeptus Astartes" for a chapter, and
 * every faction's last; a top-level name such as "Imperium" spans too many armies to compare with.
 */
function peerGroup(size: CalibratedSize, catalogueName: string) {
  const parts = catalogueName.split(' - ')
  for (let length = parts.length; length > 1; length--) {
    const peers = PEERS[size][parts.slice(0, length).join(' - ')]
    if (peers) return { peers, label: parts[length - 1]! }
  }
  return { peers: PEERS[size]['']!, label: null }
}

/** The grades for a roster's units, each a unit and everything attached to it, from the name of its army's catalogue. */
export function rosterGrades(units: readonly GradedUnit[], limit: number, catalogueName: string): RosterGrades {
  const size = calibratedSize(limit)
  const { peers, label: peerLabel } = peerGroup(size, catalogueName)
  const measures = gradeMeasures(units, limit)
  const score = (key: MetricKey, value: number | null | undefined) => {
    const quantiles = peers.measures[key]
    return quantiles && value !== null && value !== undefined && units.length ? percentileOf(value, quantiles) : null
  }
  // Categories average the measures' percentiles, not their scores, as the calibration does.
  const percentiles = new Map<MetricKey, number | null>()
  const row = (key: MetricKey, label: string, percentile: number | null, detail: string, extra: Partial<GradeRow> = {}): GradeRow => {
    percentiles.set(key, percentile)
    const shown = display(percentile)
    return { key, label, score: shown, grade: gradeOf(shown), detail, ...extra }
  }
  const named = (chosen: readonly GradedUnit[]) => chosen.map((unit) => unit.name)
  const holders = units.filter((unit) => unit.objectiveControl !== null && unit.objectiveControl >= SQUAD_OC)
  const unknownControl = named(units.filter((unit) => unit.objectiveControl === null))
  const cheap = units.filter((unit) => unit.points > 0 && unit.points <= CHEAP_UNIT_POINTS)
  const early = units.filter(deploysEarly)
  const generation = units.flatMap((unit) =>
    (unit.unitGeneration ?? []).map((spawn) => {
      const condition = spawn.trigger === 'kill' ? 'requires a qualifying kill' : 'uses shooting'
      const sharedLimit = spawn.shared ? '; once per turn across your army' : ''
      return `${unit.name} → ${spawn.unit} (${condition}${sharedLimit})`
    }),
  )
  const gap = deploymentGap(limit)
  const rows: GradeRow[] = [
    row('presence', 'Board presence', score('presence', measures.presence), `${unitCount(units.length)} for ${OBJECTIVES} objectives`),
    row(
      'hold',
      'Hold objectives',
      score('hold', measures.hold),
      measures.hold === null
        ? "No unit's objective control could be counted"
        : `${unitCount(holders.length)} with OC ${SQUAD_OC} or more, enough to contest a five-model squad`,
      { units: named(holders), ...(unknownControl.length ? { notCalculated: unknownControl } : {}) },
    ),
    row(
      'screens',
      'Screens and actions',
      score('screens', measures.screens),
      `${unitCount(cheap.length)} at ${CHEAP_UNIT_POINTS} points or less, cheap enough to screen or do actions`,
      { units: named(cheap) },
    ),
    ...(generation.length
      ? [
          row(
            'generation',
            'Unit generation',
            null,
            'Extra units may screen space. Their future number, objective control, actions and damage are not scored.',
            { units: generation },
          ),
        ]
      : []),
    row(
      'reach',
      'Charge reach',
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
    row(
      'movement',
      'Movement tools',
      null,
      'Normal moves help reach objectives without charging. Conditional moves are listed, not scored or assumed to happen. Terrain, transports and later repositioning are not measured.',
      {
        units: units.map(
          (unit) => `${unit.name}: ${unit.move}″ normal move${unit.movementTools?.length ? `; ${unit.movementTools.join('; ')}` : ''}`,
        ),
      },
    ),
  ]
  const missing: string[] = []
  for (const target of gradedTargets(limit)) {
    const removed = units.reduce((sum, unit) => sum + (unit.removes[target.key] ?? 0), 0)
    const alone = units.filter((unit) => (unit.removes[target.key] ?? 0) >= 0.5)
    const notCalculated = named(units.filter((unit) => unit.removes[target.key] === null))
    const value = score(target.key, measures[target.key])
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
    const average = mean(members.map((member) => percentiles.get(member.key) ?? null))
    const percentile = average === null ? null : percentileOf(average, peers.categories[category.key]!)
    const shown = display(percentile)
    return { percentile, category: { key: category.key, label: category.label, score: shown, grade: gradeOf(shown), rows: members } }
  })
  const overall = mean(categories.map(({ percentile }) => percentile))
  const shown = categories.flatMap(({ category }) => (category.score === null ? [] : [category.score]))
  // Lists that place usually stand out somewhere, so one middling at everything ranks low among them; it still
  // never reads as worse than its weakest category or better than its strongest.
  const total =
    overall === null ? null : Math.min(Math.max(display(percentileOf(overall, peers.overall))!, Math.min(...shown)), Math.max(...shown))
  return {
    score: total,
    grade: gradeOf(total),
    categories: categories.map(({ category }) => category),
    missing,
    comparedWith: peerLabel,
  }
}

const formatAttackers = () => REFERENCE_ATTACKERS.map((attacker) => attacker.label).join(' or ')

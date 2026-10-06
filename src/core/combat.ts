import { z } from 'zod'

export const MAX_COMBAT_MODELS = 100

const diceSchema = z.object({ dice: z.int().min(0).max(10), sides: z.union([z.literal(3), z.literal(6)]), bonus: z.int().min(0).max(100) })
const amountSchema = z.union([z.int().min(0).max(100), diceSchema])
const rollTarget = z.int().min(2).max(6)
const reroll = z.enum(['none', 'ones', 'failed'])
const modifier = z.int().min(-100).max(100)
const mortalWoundsSchema = z
  .object({
    timing: z.enum(['before', 'after']),
    rolls: z.int().min(1).max(100),
    psychic: z.boolean().optional(),
    outcomes: z
      .array(z.object({ min: z.int().min(1).max(6), max: z.int().min(1).max(6), damage: diceSchema }))
      .min(1)
      .max(6),
  })
  .refine(
    ({ outcomes }) =>
      outcomes.every(
        (outcome, index) =>
          outcome.min <= outcome.max &&
          outcomes.slice(0, index).every((previous) => outcome.min > previous.max || outcome.max < previous.min),
      ),
    'Mortal-wound outcomes must not overlap.',
  )

const targetGroupSchema = z.object({
  models: z.int().min(1).max(MAX_COMBAT_MODELS),
  toughness: z.int().min(1).max(100),
  save: z.int().min(2).max(7),
  invulnerable: rollTarget.nullable(),
  wounds: z.int().min(1).max(100),
  feelNoPain: rollTarget.nullable().optional(),
  psychicFeelNoPain: rollTarget.nullable().optional(),
  mortalFeelNoPain: rollTarget.nullable().optional(),
  damageDivisor: z.int().min(1).max(16).optional(),
  damageReduction: z.int().min(0).max(100).optional(),
  damage: z.int().min(0).max(99).optional(),
  bodyguard: z.boolean().optional(),
  character: z.boolean().optional(),
  unit: z.string().max(400).optional(),
  feelNoPainSources: z
    .array(z.object({ unit: z.string().max(400), value: rollTarget }))
    .max(8)
    .optional(),
})

export const combatSchema = z.object({
  target: z.object({
    /** Allocation groups in the order attacks are allocated to them (05.03). */
    groups: z
      .array(targetGroupSchema)
      .min(1)
      .max(20)
      .refine((groups) => groups.reduce((total, group) => total + group.models, 0) <= MAX_COMBAT_MODELS, 'The target has too many models.'),
    feelNoPain: rollTarget.nullable(),
    psychicFeelNoPain: rollTarget.nullable().optional(),
    mortalFeelNoPain: rollTarget.nullable().optional(),
    damageDivisor: z.int().min(1).max(16).optional(),
    damageReduction: z.int().min(0).max(100).optional(),
    damage: z.int().min(0).max(99).optional(),
    saveReroll: reroll.optional(),
  }),
  weapons: z
    .array(
      z.object({
        count: z.int().min(1).max(100),
        attacks: diceSchema,
        skill: rollTarget,
        strength: z.int().min(1).max(100),
        ap: z.int().min(-10).max(0),
        damage: diceSchema,
        damageReroll: z.literal('ones').optional(),
        torrent: z.boolean(),
        lethal: z.boolean(),
        sustained: amountSchema,
        devastating: z.boolean(),
        criticalWound: rollTarget,
        criticalHit: rollTarget.optional(),
        successfulCriticalHit: rollTarget.optional(),
        successfulCriticalWound: rollTarget.optional(),
        allHitsCritical: z.boolean().optional(),
        criticalAp: z.int().min(-10).max(10).optional(),
        ignoreHitModifiers: z.boolean().optional(),
        ignoreWoundModifiers: z.boolean().optional(),
        ignoreSkillModifiers: z.boolean().optional(),
        baseSkill: rollTarget.optional(),
        positiveHitModifier: modifier.optional(),
        positiveWoundModifier: modifier.optional(),
        hitModifier: modifier.optional(),
        woundModifier: modifier.optional(),
        strongerWoundModifier: modifier.optional(),
        notStrongerWoundModifier: modifier.optional(),
        doubleStrengthWoundModifier: modifier.optional(),
        hitReroll: reroll.optional(),
        woundReroll: reroll.optional(),
        twinLinked: z.boolean(),
        ignoresCover: z.boolean(),
        indirectFire: z.boolean().optional(),
        psychic: z.boolean(),
        blast: z.int().min(0).max(10),
        cleave: z.int().min(0).max(10).optional(),
        oneShot: z.boolean().optional(),
        rapidFire: amountSchema,
        melta: amountSchema,
        heavy: z.boolean(),
        lance: z.boolean(),
      }),
    )
    .min(0)
    .max(60),
  mortalWounds: z.array(mortalWoundsSchema).max(20).optional(),
  options: z.object({
    phase: z.enum(['ranged', 'melee']),
    cover: z.boolean(),
    indirectFire: z.enum(['direct', 'unobserved', 'spotted']).optional(),
    halfRange: z.boolean(),
    heavy: z.boolean(),
    charged: z.boolean(),
    hitModifier: modifier,
    psychicHitModifier: z.int().min(0).max(100).optional(),
    positiveWoundModifier: modifier.optional(),
    woundModifier: modifier,
    hitReroll: reroll,
    woundReroll: reroll,
    lethal: z.boolean(),
  }),
})

export type CombatInput = z.infer<typeof combatSchema>
export type CombatTargetGroup = CombatInput['target']['groups'][number]
export type CombatWeapon = CombatInput['weapons'][number]
export type CombatOptions = CombatInput['options']
export type DiceExpression = z.infer<typeof diceSchema>
export type CombatResult = { kills: number[]; damage: number[]; meanKills: number; meanDamage: number; wipe: number }
export const rerollRank = { none: 0, ones: 1, failed: 2 } as const

export const DEFAULT_COMBAT_OPTIONS: CombatOptions = {
  phase: 'ranged',
  cover: false,
  indirectFire: 'direct',
  halfRange: false,
  heavy: false,
  charged: false,
  hitModifier: 0,
  woundModifier: 0,
  hitReroll: 'none',
  woundReroll: 'none',
  lethal: true,
}

export function diceExpression(value: string): DiceExpression | null {
  const text = value.replaceAll(/\s/g, '').toUpperCase()
  const match = /^(?:(\d*)D([36])(?:\+(\d+))?|(\d+))$/.exec(text)
  if (!match) return null
  const parsed = diceSchema.safeParse({
    dice: match[2] ? Number(match[1] || 1) : 0,
    sides: Number(match[2] ?? 6),
    bonus: Number(match[3] ?? match[4] ?? 0),
  })
  return parsed.success ? parsed.data : null
}

export const targetModels = (target: CombatInput['target']) => target.groups.reduce((total, group) => total + group.models, 0)
export const targetWounds = (target: CombatInput['target']) =>
  target.groups.reduce((total, group) => total + group.models * group.wounds - (group.damage ?? 0), 0) - (target.damage ?? 0)

export function woundTarget(strength: number, toughness: number) {
  return strength >= toughness * 2 ? 2 : strength > toughness ? 3 : strength === toughness ? 4 : strength * 2 <= toughness ? 6 : 5
}

const cappedModifier = (value: number) => Math.max(-1, Math.min(1, value))
const maximum = (expression: DiceExpression | number) =>
  typeof expression === 'number' ? expression : expression.dice * expression.sides + expression.bonus
export const bestReroll = (first: CombatOptions['hitReroll'], second?: CombatOptions['hitReroll']) =>
  first === 'failed' || second === 'failed' ? 'failed' : first === 'ones' || second === 'ones' ? 'ones' : 'none'
export const rollSucceeds = (value: number, target: number, bonus: number, critical: number, minimum: number) =>
  value >= minimum && (value >= critical || value + bonus >= target)
export const saveSucceeds = (value: number, critical: boolean, group: CombatTargetGroup, weapon: CombatWeapon) =>
  value !== 1 &&
  (value + weapon.ap + (critical ? (weapon.criticalAp ?? 0) : 0) >= group.save ||
    (group.invulnerable !== null && value >= group.invulnerable))

export function attackRolls(weapon: CombatWeapon, options: CombatOptions, toughness: number) {
  const ranged = options.phase === 'ranged'
  const indirect = ranged && weapon.indirectFire === true && (options.indirectFire === 'unobserved' || options.indirectFire === 'spotted')
  const cover = ranged && (options.cover || indirect) && !weapon.ignoresCover && !weapon.psychic
  const skill =
    weapon.ignoreSkillModifiers || (ranged && weapon.psychic)
      ? Math.min(weapon.baseSkill ?? weapon.skill, weapon.skill)
      : Math.min(6, weapon.skill + Number(cover))
  const hitBonus = cappedModifier(
    (weapon.psychic || weapon.ignoreHitModifiers ? (options.psychicHitModifier ?? Math.max(0, options.hitModifier)) : options.hitModifier) +
      Number(ranged && weapon.heavy && options.heavy) +
      (weapon.psychic || weapon.ignoreHitModifiers
        ? (weapon.positiveHitModifier ?? Math.max(0, weapon.hitModifier ?? 0))
        : (weapon.hitModifier ?? 0)),
  )
  const woundBonus = cappedModifier(
    (weapon.ignoreWoundModifiers ? (options.positiveWoundModifier ?? Math.max(0, options.woundModifier)) : options.woundModifier) +
      (weapon.ignoreWoundModifiers
        ? (weapon.positiveWoundModifier ?? Math.max(0, weapon.woundModifier ?? 0))
        : (weapon.woundModifier ?? 0)) +
      (weapon.strength > toughness
        ? weapon.ignoreWoundModifiers
          ? Math.max(0, weapon.strongerWoundModifier ?? 0)
          : (weapon.strongerWoundModifier ?? 0)
        : 0) +
      (weapon.strength >= toughness * 2
        ? weapon.ignoreWoundModifiers
          ? Math.max(0, weapon.doubleStrengthWoundModifier ?? 0)
          : (weapon.doubleStrengthWoundModifier ?? 0)
        : 0) +
      (weapon.strength <= toughness
        ? weapon.ignoreWoundModifiers
          ? Math.max(0, weapon.notStrongerWoundModifier ?? 0)
          : (weapon.notStrongerWoundModifier ?? 0)
        : 0) +
      Number(!ranged && weapon.lance && options.charged),
  )
  return { indirect, skill, hitBonus, woundBonus, wound: woundTarget(weapon.strength, toughness) }
}

/** Whether changing a critical threshold changes any possible roll in the current matchup. */
export function criticalThresholdMatters(current: CombatInput, previous: CombatInput, kind: 'hit' | 'wound') {
  return current.weapons.some((weapon, index) => {
    const before = previous.weapons[index]
    if (!before || (weapon.torrent && kind === 'hit')) return false
    const threshold = kind === 'hit' ? (weapon.criticalHit ?? 6) : weapon.criticalWound
    const oldThreshold = kind === 'hit' ? (before.criticalHit ?? 6) : before.criticalWound
    if (threshold === oldThreshold) return false
    return current.target.groups.some((group) => {
      const rolls = attackRolls(weapon, current.options, group.toughness)
      const target = kind === 'hit' ? rolls.skill : rolls.wound
      const bonus = kind === 'hit' ? rolls.hitBonus : rolls.woundBonus
      const minimum = kind === 'hit' && rolls.indirect ? (current.options.indirectFire === 'spotted' ? 4 : 6) : 2
      for (let value = 2; value <= 6; value++) {
        const success = (critical: number) => rollSucceeds(value, target, bonus, critical, minimum)
        if (success(threshold) !== success(oldThreshold)) return true
        if (!success(threshold)) continue
        const critical = (limit: number) =>
          value >= limit ||
          (kind === 'hit'
            ? weapon.allHitsCritical || Boolean(weapon.successfulCriticalHit && value >= weapon.successfulCriticalHit)
            : Boolean(weapon.successfulCriticalWound && value >= weapon.successfulCriticalWound))
        if (critical(threshold) === critical(oldThreshold)) continue
        if (kind === 'hit' && ((weapon.lethal && current.options.lethal) || maximum(weapon.sustained) > 0)) return true
        if (kind === 'wound' && (weapon.devastating || Boolean(weapon.criticalAp))) return true
      }
      return false
    })
  })
}

/** Compare the effective re-roll after datasheet and situational rules combine. */
export function rerollAdjustmentMatters(current: CombatInput, previous: CombatInput, kind: 'hit' | 'wound') {
  return current.weapons.some((weapon, index) => {
    if (kind === 'hit' && weapon.torrent) return false
    const before = previous.weapons[index]
    if (!before) return false
    const effective = (input: CombatInput, own: CombatWeapon) => {
      const option = kind === 'hit' ? input.options.hitReroll : input.options.woundReroll
      const printed = kind === 'hit' ? own.hitReroll : own.twinLinked ? 'failed' : own.woundReroll
      return Math.max(rerollRank[option], rerollRank[printed ?? 'none'])
    }
    return effective(current, weapon) !== effective(previous, before)
  })
}

/** Compare the six possible roll outcomes after modifiers, limits, and weapon rules apply. */
export function rollAdjustmentMatters(current: CombatInput, previous: CombatInput, kind: 'hit' | 'wound') {
  return current.weapons.some((weapon, index) => {
    const before = previous.weapons[index]
    if (!before || (kind === 'hit' && weapon.torrent)) return false
    return current.target.groups.some((group, groupIndex) => {
      const now = attackRolls(weapon, current.options, group.toughness)
      const old = attackRolls(before, previous.options, previous.target.groups[groupIndex]?.toughness ?? group.toughness)
      const target = kind === 'hit' ? now.skill : now.wound
      const oldTarget = kind === 'hit' ? old.skill : old.wound
      const bonus = kind === 'hit' ? now.hitBonus : now.woundBonus
      const oldBonus = kind === 'hit' ? old.hitBonus : old.woundBonus
      const threshold = kind === 'hit' ? (weapon.criticalHit ?? 6) : weapon.criticalWound
      const oldThreshold = kind === 'hit' ? (before.criticalHit ?? 6) : before.criticalWound
      const minimum = kind === 'hit' && now.indirect ? (current.options.indirectFire === 'spotted' ? 4 : 6) : 2
      const oldMinimum = kind === 'hit' && old.indirect ? (previous.options.indirectFire === 'spotted' ? 4 : 6) : 2
      return [2, 3, 4, 5, 6].some(
        (value) =>
          rollSucceeds(value, target, bonus, threshold, minimum) !== rollSucceeds(value, oldTarget, oldBonus, oldThreshold, oldMinimum),
      )
    })
  })
}

/** A save or AP change matters only if some possible save result changes. */
export function saveAdjustmentMatters(current: CombatInput, previous: CombatInput) {
  return current.weapons.some((weapon, index) => {
    const before = previous.weapons[index]
    if (!before) return false
    return current.target.groups.some((group, groupIndex) => {
      const old = previous.target.groups[groupIndex]
      return (
        old &&
        [false, true].some((critical) =>
          [2, 3, 4, 5, 6].some((value) => saveSucceeds(value, critical, group, weapon) !== saveSucceeds(value, critical, old, before)),
        )
      )
    })
  })
}

export function halfRangeMatters(input: CombatInput) {
  return input.weapons.some((weapon) => maximum(weapon.rapidFire) > 0 || maximum(weapon.melta) > 0)
}

/** Probabilities indexed by a count or a total. */
type Weights = number[]

const MAX_COMBAT_WORK = 2_000_000_000

function convolve(left: Weights, right: Weights) {
  const result: Weights = Array.from({ length: left.length + right.length - 1 }, () => 0)
  left.forEach((first, i) => {
    if (first) right.forEach((second, j) => (result[i + j]! += first * second))
  })
  return result
}

function diceWeights(expression: DiceExpression | number): Weights {
  if (typeof expression === 'number') return [...Array.from({ length: expression }, () => 0), 1]
  const face = [0, ...Array.from({ length: expression.sides }, () => 1 / expression.sides)]
  let weights: Weights = [1]
  for (let i = 0; i < expression.dice; i++) weights = convolve(weights, face)
  return [...Array.from({ length: expression.bonus }, () => 0), ...weights]
}

/** The final face of one D6, indexed 1–6, when `again` names the faces that are re-rolled once. */
function rerolledFaces(again: (value: number) => boolean) {
  const faces: Weights = Array.from({ length: 7 }, () => 0)
  for (let value = 1; value <= 6; value++) {
    if (again(value)) for (let second = 1; second <= 6; second++) faces[second]! += 1 / 36
    else faces[value]! += 1 / 6
  }
  return faces
}

const logFactorials = [0]
function binomial(count: number, chance: number): Weights {
  if (chance <= 0) return [1, ...Array.from({ length: count }, () => 0)]
  if (chance >= 1) return [...Array.from({ length: count }, () => 0), 1]
  for (let n = logFactorials.length; n <= count; n++) logFactorials.push(logFactorials[n - 1]! + Math.log(n))
  return Array.from({ length: count + 1 }, (_, k) =>
    Math.exp(
      logFactorials[count]! - logFactorials[k]! - logFactorials[count - k]! + k * Math.log(chance) + (count - k) * Math.log(1 - chance),
    ),
  )
}

/** Each wound lost with `chance`, as Feel No Pain rolls it for each point of damage. */
function thinned(wounds: Weights, chance: number) {
  if (chance >= 1) return wounds
  const result: Weights = Array.from({ length: wounds.length }, () => 0)
  wounds.forEach((weight, count) => {
    if (weight) binomial(count, chance).forEach((share, lost) => (result[lost]! += weight * share))
  })
  return result
}

const keptBy = (prevention: number) => (prevention > 6 ? 1 : (prevention - 1) / 6)

/**
 * Where each total of wounds lost leaves the target.
 *
 * Allocation order and the no-spill rule make that total enough to know which model is current,
 * how many wounds it has left, and which models are destroyed.
 */
function allocation(target: CombatInput['target']) {
  const total = targetWounds(target)
  const group = new Int32Array(total + 1).fill(-1)
  const remaining = new Int32Array(total + 1)
  const killed = new Int32Array(total + 1)
  let lost = 0
  let model = 0
  target.groups.forEach((entry, index) => {
    for (let i = 0; i < entry.models; i++, model++)
      for (
        let left = i ? entry.wounds : entry.wounds - (entry.damage ?? 0) - (index === 0 ? (target.damage ?? 0) : 0);
        left > 0;
        left--, lost++
      ) {
        group[lost] = index
        remaining[lost] = left
        killed[lost] = model
      }
  })
  killed[total] = model
  // Wound rolls use the highest Toughness still on the battlefield (05.02.01); earlier groups are destroyed first.
  const toughness = Array.from(group, (index) =>
    index < 0
      ? 0
      : Math.max(
          ...(target.groups.slice(index).some((entry) => entry.bodyguard)
            ? target.groups.slice(index).filter((entry) => entry.bodyguard)
            : target.groups.slice(index)
          ).map((entry) => entry.toughness),
        ),
  )
  return { total, group, remaining, killed, toughness }
}
type Allocation = ReturnType<typeof allocation>
type State = Float64Array

function addInto(target: State, source: State, weight = 1) {
  for (let at = 0; at < target.length; at++) target[at]! += source[at]! * weight
}

const tailsOf = new WeakMap<Weights, Weights>()

/** One unsaved attack's damage, discarding whatever exceeds the current model's wounds. */
function inflict(state: State, lost: Weights | readonly Weights[], layout: Allocation, applies?: (at: number) => boolean) {
  const result = new Float64Array(state.length)
  result[layout.total] = state[layout.total]!
  const distributions: readonly Weights[] = typeof lost[0] === 'number' ? [lost as Weights] : (lost as readonly Weights[])
  const tails = distributions.map((points) => {
    let tail = tailsOf.get(points)
    if (!tail) {
      tail = points.map((_, from) => points.slice(from).reduce((total, weight) => total + weight, 0))
      tailsOf.set(points, tail)
    }
    return tail
  })
  for (let at = 0; at < layout.total; at++) {
    const weight = state[at]!
    if (!weight) continue
    if (applies && !applies(at)) {
      result[at]! += weight
      continue
    }
    const group = distributions.length === 1 ? 0 : layout.group[at]!
    const points = distributions[group]!
    const room = layout.remaining[at]!
    for (let wounds = 0; wounds < Math.min(room, points.length); wounds++) result[at + wounds]! += weight * points[wounds]!
    if (room < points.length) result[at + room]! += weight * tails[group]![room]!
  }
  return result
}

/** Mortal wounds from a separate ability, each of which spills onto the next model. */
function spill(state: State, points: Weights, layout: Allocation, prevention?: readonly number[]) {
  const result = new Float64Array(state.length)
  let current: State = state
  for (let wounds = 0; wounds < points.length; wounds++) {
    addInto(result, current, points[wounds])
    if (wounds === points.length - 1) break
    const next = new Float64Array(state.length)
    for (let at = 0; at <= layout.total; at++) {
      const kept = at === layout.total ? 0 : keptBy(prevention?.[layout.group[at]!] ?? 7)
      next[at]! += current[at]! * (1 - kept)
      next[Math.min(layout.total, at + 1)]! += current[at]! * kept
    }
    current = next
  }
  return result
}

export function combatGroupProtection(target: CombatInput['target'], group: CombatTargetGroup) {
  const feelNoPain = Math.min(
    (group.feelNoPain === undefined ? target.feelNoPain : group.feelNoPain) ?? 7,
    ...(group.feelNoPainSources ?? []).map((source) => source.value),
  )
  return {
    ...target,
    feelNoPain: feelNoPain === 7 ? null : feelNoPain,
    psychicFeelNoPain: group.psychicFeelNoPain === undefined ? target.psychicFeelNoPain : group.psychicFeelNoPain,
    mortalFeelNoPain: group.mortalFeelNoPain === undefined ? target.mortalFeelNoPain : group.mortalFeelNoPain,
    damageReduction: group.damageReduction ?? target.damageReduction,
    damageDivisor: group.damageDivisor ?? target.damageDivisor,
  }
}

function packetLosses(weapon: CombatWeapon, target: CombatInput['target'], prevention: number, halfRange: boolean) {
  const rolled = diceWeights(weapon.damage)
  const once = weapon.damageReroll === 'ones' ? rolled.map((weight, value) => (value === 1 ? 0 : weight) + rolled[1]! * weight) : rolled
  const base = halfRange ? convolve(once, diceWeights(weapon.melta)) : once
  const reduced: Weights = Array.from({ length: base.length }, () => 0)
  base.forEach((weight, value) => {
    const after = value === 0 ? 0 : Math.max(1, Math.ceil(value / (target.damageDivisor ?? 1) - (target.damageReduction ?? 0)))
    reduced[after]! += weight
  })
  return thinned(reduced, keptBy(prevention))
}

type Polynomial = Map<number, number>
function multiply(left: Polynomial, right: Polynomial) {
  const result: Polynomial = new Map()
  for (const [i, first] of left) for (const [j, second] of right) result.set(i + j, (result.get(i + j) ?? 0) + first * second)
  return result
}
const sum = (...terms: [Polynomial, number][]) => {
  const result: Polynomial = new Map()
  for (const [polynomial, weight] of terms)
    for (const [at, value] of polynomial) if (value * weight) result.set(at, (result.get(at) ?? 0) + value * weight)
  return result
}

function attackCounts(weapon: CombatWeapon, models: number, halfRange: boolean) {
  const extra = (weapon.blast + (weapon.cleave ?? 0)) * Math.floor(models / 5)
  const each = convolve(convolve(diceWeights(weapon.attacks), diceWeights(extra)), halfRange ? diceWeights(weapon.rapidFire) : [1])
  let total: Weights = [1]
  for (let carrier = 0; carrier < weapon.count; carrier++) total = convolve(total, each)
  return total
}

/** How one weapon resolves against one Toughness, before its pool is built. */
function weaponPlan(weapon: CombatWeapon, input: CombatInput, toughness: number, models = targetModels(input.target)) {
  const { target, options } = input
  const halfRange = options.phase === 'ranged' && options.halfRange
  const { indirect, skill, hitBonus, woundBonus, wound } = attackRolls(weapon, options, toughness)
  let miss = 0
  let hit = weapon.torrent ? 1 : 0
  let criticalHit = 0
  if (!weapon.torrent) {
    const succeeds = (value: number) =>
      rollSucceeds(value, skill, hitBonus, weapon.criticalHit ?? 6, indirect ? (options.indirectFire === 'spotted' ? 4 : 6) : 2)
    const rerolls = indirect ? 'none' : bestReroll(options.hitReroll, weapon.hitReroll)
    rerolledFaces((value) => (rerolls === 'ones' && value === 1) || (rerolls === 'failed' && !succeeds(value))).forEach((weight, value) => {
      if (!weight) return
      if (!succeeds(value)) miss += weight
      else if (
        (value !== 1 && value >= (weapon.criticalHit ?? 6)) ||
        (weapon.successfulCriticalHit && value >= weapon.successfulCriticalHit) ||
        weapon.allHitsCritical
      )
        criticalHit += weight
      else hit += weight
    })
  }
  const woundSucceeds = (value: number) => rollSucceeds(value, wound, woundBonus, weapon.criticalWound, 2)
  const woundRerolls = weapon.twinLinked ? 'failed' : bestReroll(options.woundReroll, weapon.woundReroll)
  let failed = 0
  let devastating = 0
  const saves = [0, 0]
  rerolledFaces((value) => (woundRerolls === 'ones' && value === 1) || (woundRerolls === 'failed' && !woundSucceeds(value))).forEach(
    (weight, value) => {
      if (!weight) return
      if (!woundSucceeds(value)) return (failed += weight)
      const critical =
        (value !== 1 && value >= weapon.criticalWound) || Boolean(weapon.successfulCriticalWound && value >= weapon.successfulCriticalWound)
      if (weapon.devastating && critical) devastating += weight
      else saves[Number(critical)]! += weight
    },
  )
  const groups = target.groups
  const saveFaces = (critical: boolean, rolling: CombatTargetGroup) =>
    rerolledFaces((value) =>
      target.saveReroll === 'failed' ? !saveSucceeds(value, critical, rolling, weapon) : target.saveReroll === 'ones' && value === 1,
    )
  const sharedSaves = groups.every((group) => group.save === groups[0]!.save && group.invulnerable === groups[0]!.invulnerable)
  const failChance = (critical: boolean) =>
    saveFaces(critical, groups[0]!).reduce(
      (total, weight, value) => total + (value && !saveSucceeds(value, critical, groups[0]!, weapon) ? weight : 0),
      0,
    )
  const separateCritical =
    !sharedSaves &&
    saves[1]! > 0 &&
    [1, 2, 3, 4, 5, 6].some((value) =>
      groups.some((group) => saveSucceeds(value, true, group, weapon) !== saveSucceeds(value, false, group, weapon)),
    )
  const sustained = diceWeights(weapon.sustained)
  const attacks = attackCounts(weapon, models, halfRange)
  const events = (attacks.length - 1) * sustained.length + 1
  const dimensions = [
    ...(devastating ? ['devastating'] : []),
    ...(sharedSaves ? ['failed'] : ['ordinary', ...(separateCritical ? ['critical'] : [])]),
  ]
  const stride = (name: string) => (dimensions.includes(name) ? events ** dimensions.indexOf(name) : 0)
  return {
    halfRange,
    hit,
    miss,
    criticalHit,
    failed,
    devastating,
    saves,
    sharedSaves,
    separateCritical,
    failChances: sharedSaves ? [failChance(false), failChance(true)] : null,
    saveFaces,
    sustained,
    attacks,
    events,
    dimensions,
    stride,
  }
}

/** The joint count of devastating wounds and saves (or failed saves) the whole attack pool produces. */
function attackPool(weapon: CombatWeapon, input: CombatInput, plan: ReturnType<typeof weaponPlan>) {
  const { stride, saves } = plan
  const save = (critical: boolean): Polynomial => {
    if (plan.failChances) {
      const chance = plan.failChances[Number(critical)]!
      return new Map([
        [0, 1 - chance],
        [stride('failed'), chance],
      ])
    }
    return new Map([[critical && plan.separateCritical ? stride('critical') : stride('ordinary'), 1]])
  }
  const woundRoll = sum(
    [new Map([[0, 1]]), plan.failed],
    [new Map([[stride('devastating'), 1]]), plan.devastating],
    [save(false), saves[0]!],
    [save(true), saves[1]!],
  )
  const critical = weapon.lethal && input.options.lethal ? save(false) : woundRoll
  let extra: Polynomial = new Map()
  let power: Polynomial = new Map([[0, 1]])
  plan.sustained.forEach((weight, count) => {
    if (count) power = multiply(power, woundRoll)
    if (weight) extra = sum([extra, 1], [power, weight])
  })
  const attack = sum([new Map([[0, 1]]), plan.miss], [woundRoll, plan.hit], [multiply(critical, extra), plan.criticalHit])
  const size = plan.events ** plan.dimensions.length
  const pool = new Float64Array(size)
  let current = new Float64Array(size)
  current[0] = 1
  let reach = 0
  const furthest = Math.max(...attack.keys())
  plan.attacks.forEach((weight, count) => {
    if (weight) for (let at = 0; at <= reach; at++) pool[at]! += weight * current[at]!
    if (count === plan.attacks.length - 1) return
    const next = new Float64Array(size)
    for (let at = 0; at <= reach; at++) {
      const value = current[at]!
      if (value) for (const [offset, share] of attack) next[at + offset]! += value * share
    }
    current = next
    reach = Math.min(size - 1, reach + furthest)
  })
  return pool
}

/**
 * Saves resolved from the lowest roll to the highest against whichever group is current (05.04).
 *
 * `start` is keyed by the ordinary and critical saves still to roll. Each face takes its share of
 * them in turn, ordinary saves before critical ones, so a group change mid-pool uses the right save.
 */
function allocateSaves(
  start: Map<number, State>,
  weapon: CombatWeapon,
  input: CombatInput,
  layout: Allocation,
  faces: readonly [Weights, Weights],
  lost: Weights | readonly Weights[],
  events: number,
) {
  let states = start
  const kinds = start.size && [...start.keys()].some((key) => key >= events) ? [0, 1] : [0]
  for (let value = 1; value <= 6; value++)
    for (const kind of kinds) {
      const face = faces[kind]!
      const tail = face.slice(value).reduce((total, weight) => total + weight, 0)
      const share = tail > 0 ? face[value]! / tail : 1
      const fails = Array.from(layout.group, (index) => index >= 0 && !saveSucceeds(value, kind === 1, input.target.groups[index]!, weapon))
      const failing = fails.some(Boolean) ? (at: number) => fails[at]! : null
      const next = new Map<number, State>()
      for (const [key, state] of states) {
        const count = kind ? Math.floor(key / events) : key % events
        let current = state
        binomial(count, share).forEach((weight, taken) => {
          if (weight) {
            const at = key - taken * (kind ? events : 1)
            const into = next.get(at) ?? new Float64Array(state.length)
            addInto(into, current, weight)
            next.set(at, into)
          }
          if (failing && taken < count) current = inflict(current, lost, layout, failing)
        })
      }
      states = next
    }
  return states.get(0) ?? new Float64Array(layout.total + 1)
}

function resolvePool(state: State, weapon: CombatWeapon, input: CombatInput, layout: Allocation, toughness: number, models: number) {
  const { target } = input
  const plan = weaponPlan(weapon, input, toughness, models)
  const pool = attackPool(weapon, input, plan)
  const losses = (mortal: boolean) =>
    target.groups.map((group) => {
      const protection = combatGroupProtection(target, group)
      const prevention = Math.min(
        protection.feelNoPain ?? 7,
        weapon.psychic ? (protection.psychicFeelNoPain ?? 7) : 7,
        mortal ? (protection.mortalFeelNoPain ?? 7) : 7,
      )
      return packetLosses(weapon, protection, prevention, plan.halfRange)
    })
  const ordinaryLost = losses(false)
  const devastatingLost = losses(true)
  const devastatingStride = plan.stride('devastating')
  const saveStride = devastatingStride ? plan.events : 1
  const saveCells = pool.length / (devastatingStride ? plan.events : 1)
  // Devastating wounds are inflicted while the pool is rolled, before any save.
  const afterDevastating: State[] = []
  let devastated = state
  for (let count = 0; count < (devastatingStride ? plan.events : 1); count++) {
    let present = false
    for (let cell = 0; cell < saveCells && !present; cell++) present = pool[count * devastatingStride + cell * saveStride]! > 0
    if (!present && count) break
    afterDevastating.push(present ? devastated : new Float64Array(0))
    devastated = inflict(devastated, devastatingLost, layout)
  }
  // Every devastating count leads into the same saves, so their starting states combine first.
  const combined = (cell: number, part?: (at: number) => boolean) => {
    const into = new Float64Array(state.length)
    afterDevastating.forEach((before, count) => {
      const weight = pool[count * devastatingStride + cell * saveStride]!
      if (!weight || !before.length) return
      for (let at = 0; at < into.length; at++) if (!part || part(at)) into[at]! += weight * before[at]!
    })
    return into
  }
  if (plan.failChances) {
    let result = new Float64Array(state.length)
    for (let failed = plan.events - 1; failed >= 0; failed--) {
      result = failed === plan.events - 1 ? result : inflict(result, ordinaryLost, layout)
      addInto(result, combined(failed))
    }
    return result
  }
  const result = new Float64Array(state.length)
  // Re-rolls happen while the pool's saves are rolled, so they judge the group current then.
  const rolls = target.saveReroll && target.saveReroll !== 'none' ? target.groups.map((_, index) => index) : [0]
  for (const rolling of rolls) {
    const part = rolls.length > 1 ? (at: number) => Math.max(0, layout.group[at]!) === rolling : undefined
    const start = new Map<number, State>()
    for (let cell = 0; cell < saveCells; cell++) {
      const into = combined(cell, part)
      if (into.some((weight) => weight > 0)) start.set(cell, into)
    }
    const group = target.groups[rolling]!
    const faces = [plan.saveFaces(false, group), plan.saveFaces(plan.separateCritical, group)] as const
    addInto(result, allocateSaves(start, weapon, input, layout, faces, ordinaryLost, plan.events))
  }
  return result
}

function workOf(input: CombatInput, layout: Allocation) {
  const toughnesses = new Set(layout.toughness).size
  const mortalWork = (input.mortalWounds ?? []).reduce(
    (total, ability) =>
      total + ability.rolls * (layout.total + 1) * (Math.max(...ability.outcomes.map((outcome) => maximum(outcome.damage))) + 1),
    0,
  )
  return input.weapons.reduce((total, weapon) => {
    const plan = weaponPlan(weapon, input, layout.toughness[0] ?? 0)
    const size = plan.events ** plan.dimensions.length
    const states = (layout.total + 1) * (maximum(weapon.damage) + maximum(weapon.melta) + 1)
    const saveCells = size / (plan.devastating ? plan.events : 1)
    const build = plan.attacks.length * size * (plan.sustained.length + 1)
    const combine = (plan.devastating ? plan.events : 1) * (states + saveCells * (layout.total + 1))
    const saving = plan.failChances ? plan.events * states : (plan.separateCritical ? 12 : 6) * saveCells * plan.events * states
    return total + toughnesses * (build + combine + saving * (input.target.saveReroll ? input.target.groups.length : 1))
  }, mortalWork)
}

function checkedCombat(scenario: CombatInput) {
  const input = combatSchema.parse(scenario)
  if (
    input.target.groups.some((group) =>
      group.feelNoPainSources?.some((source) => !input.target.groups.some((owner) => owner.unit === source.unit)),
    )
  )
    throw new Error('The source of a shared Feel No Pain ability is missing from the target.')
  if (input.target.groups.some((group) => group.feelNoPainSources?.length) && input.mortalWounds?.length)
    throw new Error('Shared Feel No Pain source changes during separate mortal-wound abilities are not yet supported.')
  if (input.target.groups.some((group, index) => (group.damage ?? 0) + (index === 0 ? (input.target.damage ?? 0) : 0) >= group.wounds))
    throw new Error('The wounded model must have at least one wound remaining.')
  return input
}

function resolveCombat(input: CombatInput, layout: Allocation, initial: State, models = targetModels(input.target)) {
  const { target } = input
  let state = initial
  const mortals = (timing: 'before' | 'after') => {
    for (const ability of input.mortalWounds ?? []) {
      if (ability.timing !== timing) continue
      const prevention = target.groups.map((group) => {
        const protection = combatGroupProtection(target, group)
        return Math.min(
          protection.feelNoPain ?? 7,
          protection.mortalFeelNoPain ?? 7,
          ability.psychic ? (protection.psychicFeelNoPain ?? 7) : 7,
        )
      })
      const attempt: Weights = [0]
      for (let value = 1; value <= 6; value++) {
        const outcome = ability.outcomes.find((candidate) => value >= candidate.min && value <= candidate.max)
        const points = outcome ? diceWeights(outcome.damage) : [1]
        points.forEach((weight, wounds) => (attempt[wounds] = (attempt[wounds] ?? 0) + weight / 6))
      }
      for (let i = 0; i < ability.rolls; i++)
        state = spill(
          state,
          attempt.map((weight) => weight ?? 0),
          layout,
          prevention,
        )
    }
  }
  mortals('before')
  for (const weapon of input.weapons) {
    const next = new Float64Array(state.length)
    next[layout.total] = state[layout.total]!
    const byToughness = new Map<number, State>()
    for (let at = 0; at < layout.total; at++) {
      const weight = state[at]!
      if (!weight) continue
      const part = byToughness.get(layout.toughness[at]!) ?? new Float64Array(state.length)
      part[at] = weight
      byToughness.set(layout.toughness[at]!, part)
    }
    for (const [toughness, part] of byToughness) addInto(next, resolvePool(part, weapon, input, layout, toughness, models))
    state = next
  }
  mortals('after')
  return state
}

function combatResult(state: State, target: CombatInput['target'], layout: Allocation): CombatResult {
  const damage = Array.from(state)
  const kills = Array.from({ length: targetModels(target) + 1 }, () => 0)
  damage.forEach((weight, lost) => (kills[layout.killed[lost]!]! += weight))
  return {
    kills,
    damage,
    meanKills: kills.reduce((total, weight, count) => total + weight * count, 0),
    meanDamage: damage.reduce((total, weight, lost) => total + weight * lost, 0),
    wipe: damage[layout.total]!,
  }
}

/** Resolve successive phases against the surviving models and their remaining wounds. */
export function calculateCombatSequence(scenarios: readonly CombatInput[]): CombatResult {
  if (!scenarios.length) throw new Error('Select an attack to simulate.')
  const inputs = scenarios.map(checkedCombat)
  const target = inputs[0]!.target
  const layout = allocation(target)
  if (
    inputs.some(
      (input) =>
        (input.target.damage ?? 0) !== (target.damage ?? 0) ||
        input.target.groups.length !== target.groups.length ||
        input.target.groups.some(
          (group, index) =>
            group.models !== target.groups[index]!.models ||
            group.unit !== target.groups[index]!.unit ||
            group.wounds !== target.groups[index]!.wounds ||
            (group.damage ?? 0) !== (target.groups[index]!.damage ?? 0),
        ),
    )
  )
    throw new Error('Every phase must attack the same target with the same starting wounds.')
  let state: State = new Float64Array(layout.total + 1)
  state[0] = 1
  let work = 0
  for (const input of inputs) {
    const currentLayout = allocation(input.target)
    const byModels = new Map<string, { models: number; input: CombatInput; state: State }>()
    const varies = input.weapons.some((weapon) => weapon.blast || weapon.cleave)
    const sources = [...new Set(input.target.groups.flatMap((group) => group.feelNoPainSources?.map((source) => source.unit) ?? []))]
    for (let at = 0; at < layout.total; at++) {
      if (!state[at]) continue
      const models = targetModels(target) - (varies ? layout.killed[at]! : 0)
      const alive = sources.filter((source) =>
        input.target.groups.some((group, index) => group.unit === source && index >= layout.group[at]!),
      )
      const key = JSON.stringify([models, alive])
      const part = byModels.get(key) ?? {
        models,
        input: sources.length
          ? {
              ...input,
              target: {
                ...input.target,
                groups: input.target.groups.map((group) => {
                  const feelNoPain = Math.min(
                    (group.feelNoPain === undefined ? input.target.feelNoPain : group.feelNoPain) ?? 7,
                    ...(group.feelNoPainSources ?? []).filter((source) => alive.includes(source.unit)).map((source) => source.value),
                  )
                  return { ...group, feelNoPain: feelNoPain === 7 ? null : feelNoPain, feelNoPainSources: [] }
                }),
              },
            }
          : input,
        state: new Float64Array(state.length),
      }
      part.state[at] = state[at]!
      byModels.set(key, part)
    }
    work += workOf(input, currentLayout) * byModels.size
    if (work > MAX_COMBAT_WORK) throw new Error('This attack is too large to simulate. Select fewer weapons or models.')
    const next = new Float64Array(state.length)
    next[layout.total] = state[layout.total]!
    for (const part of byModels.values()) addInto(next, resolveCombat(part.input, currentLayout, part.state, part.models))
    state = next
  }
  return combatResult(state, target, layout)
}

/** The exact distribution of wounds lost and models destroyed after every attack resolves. */
export function calculateCombat(scenario: CombatInput): CombatResult {
  return calculateCombatSequence([scenario])
}

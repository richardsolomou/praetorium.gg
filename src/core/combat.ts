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
export type CombatResult = { trials: number; kills: number[]; damage: number[]; meanKills: number; meanDamage: number; wipe: number }

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
const targetWounds = (target: CombatInput['target']) =>
  target.groups.reduce((total, group) => total + group.models * group.wounds, 0) - (target.damage ?? 0)

export function woundTarget(strength: number, toughness: number) {
  return strength >= toughness * 2 ? 2 : strength > toughness ? 3 : strength === toughness ? 4 : strength * 2 <= toughness ? 6 : 5
}

const cappedModifier = (value: number) => Math.max(-1, Math.min(1, value))
const maximum = (expression: DiceExpression | number) =>
  typeof expression === 'number' ? expression : expression.dice * expression.sides + expression.bonus
const d6 = (random: () => number) => Math.floor(random() * 6) + 1

function roll(expression: DiceExpression | number, random: () => number) {
  if (typeof expression === 'number') return expression
  let result = expression.bonus
  for (let i = 0; i < expression.dice; i++) result += Math.floor(random() * expression.sides) + 1
  return result
}

function check(target: number, bonus: number, critical: number, rerolls: CombatOptions['hitReroll'], random: () => number, minimum = 2) {
  const succeeds = (value: number) => value >= minimum && (value >= critical || value + bonus >= target)
  let value = d6(random)
  if ((rerolls === 'ones' && value === 1) || (rerolls === 'failed' && !succeeds(value))) value = d6(random)
  return { success: succeeds(value), critical: value !== 1 && value >= critical, value }
}

export function attackSequence({ target, weapons, options, mortalWounds = [] }: CombatInput, random: () => number) {
  const models = targetModels(target)
  const alive = target.groups.map((group) => group.models)
  let current = 0
  let killed = 0
  let remaining = target.groups[0]!.wounds - (target.damage ?? 0)
  let damage = 0
  // Wound rolls happen before any save, so a pool uses the highest Toughness still on the battlefield (05.02.01).
  const toughness = () => Math.max(...target.groups.flatMap((group, index) => (alive[index] ? [group.toughness] : [])))
  const destroyOne = () => {
    killed++
    alive[current]!--
    if (!alive[current]) current++
    remaining = target.groups[current]?.wounds ?? 0
  }
  const inflictMortals = (timing: 'before' | 'after') => {
    for (const ability of mortalWounds) {
      if (ability.timing !== timing) continue
      const feelNoPain = Math.min(
        target.feelNoPain ?? 7,
        target.mortalFeelNoPain ?? 7,
        ability.psychic ? (target.psychicFeelNoPain ?? 7) : 7,
      )
      for (let attempt = 0; attempt < ability.rolls; attempt++) {
        if (killed === models) break
        const result = d6(random)
        const outcome = ability.outcomes.find((candidate) => result >= candidate.min && result <= candidate.max)
        if (!outcome) continue
        const wounds = roll(outcome.damage, random)
        for (let wound = 0; wound < wounds; wound++) {
          if (killed === models) break
          if (feelNoPain < 7 && d6(random) >= feelNoPain) continue
          damage++
          if (--remaining === 0) destroyOne()
        }
      }
    }
  }
  inflictMortals('before')
  if (killed === models) return { damage, killed }
  const ranged = options.phase === 'ranged'
  for (const weapon of weapons) {
    if (killed === models) return { damage, killed }
    const defending = toughness()
    const indirect = ranged && weapon.indirectFire === true && (options.indirectFire === 'unobserved' || options.indirectFire === 'spotted')
    const cover = ranged && (options.cover || indirect) && !weapon.ignoresCover && !weapon.psychic
    const skill =
      weapon.ignoreSkillModifiers || (ranged && weapon.psychic)
        ? Math.min(weapon.baseSkill ?? weapon.skill, weapon.skill)
        : Math.min(6, weapon.skill + Number(cover))
    const hitBonus = cappedModifier(
      (weapon.psychic || weapon.ignoreHitModifiers
        ? (options.psychicHitModifier ?? Math.max(0, options.hitModifier))
        : options.hitModifier) +
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
        (weapon.strength > defending
          ? weapon.ignoreWoundModifiers
            ? Math.max(0, weapon.strongerWoundModifier ?? 0)
            : (weapon.strongerWoundModifier ?? 0)
          : 0) +
        (weapon.strength >= defending * 2
          ? weapon.ignoreWoundModifiers
            ? Math.max(0, weapon.doubleStrengthWoundModifier ?? 0)
            : (weapon.doubleStrengthWoundModifier ?? 0)
          : 0) +
        (weapon.strength <= defending
          ? weapon.ignoreWoundModifiers
            ? Math.max(0, weapon.notStrongerWoundModifier ?? 0)
            : (weapon.notStrongerWoundModifier ?? 0)
          : 0) +
        Number(!ranged && weapon.lance && options.charged),
    )
    const bestReroll = (first: CombatOptions['hitReroll'], second?: CombatOptions['hitReroll']) =>
      first === 'failed' || second === 'failed' ? 'failed' : first === 'ones' || second === 'ones' ? 'ones' : 'none'
    const halfRange = ranged && options.halfRange
    const wound = woundTarget(weapon.strength, defending)
    const feelNoPain = weapon.psychic ? Math.min(target.feelNoPain ?? 7, target.psychicFeelNoPain ?? 7) : (target.feelNoPain ?? 7)
    const inflict = (mortal = false) => {
      let rolledDamage = roll(weapon.damage, random)
      if (weapon.damageReroll === 'ones' && rolledDamage === 1) rolledDamage = roll(weapon.damage, random)
      const baseDamage = rolledDamage + (halfRange ? roll(weapon.melta, random) : 0)
      const rolled = baseDamage === 0 ? 0 : Math.max(1, Math.ceil(baseDamage / (target.damageDivisor ?? 1) - (target.damageReduction ?? 0)))
      let lost = rolled
      const prevention = mortal ? Math.min(feelNoPain, target.mortalFeelNoPain ?? 7) : feelNoPain
      if (prevention < 7) {
        lost = 0
        for (let i = 0; i < rolled; i++) if (d6(random) < prevention) lost++
      }
      damage += Math.min(remaining, lost)
      remaining -= lost
      if (remaining <= 0) destroyOne()
    }
    const saves: boolean[] = []
    const resolveHit = (automatic: boolean) => {
      const result = automatic
        ? { success: true, critical: false, value: 0 }
        : check(
            wound,
            woundBonus,
            weapon.criticalWound,
            weapon.twinLinked ? 'failed' : bestReroll(options.woundReroll, weapon.woundReroll),
            random,
          )
      if (!result.success) return
      if (weapon.successfulCriticalWound && result.value >= weapon.successfulCriticalWound) result.critical = true
      if (weapon.devastating && result.critical) inflict(true)
      else saves.push(result.critical)
    }
    for (let carrier = 0; carrier < weapon.count; carrier++) {
      const attacks =
        roll(weapon.attacks, random) +
        (weapon.blast + (weapon.cleave ?? 0)) * Math.floor(models / 5) +
        (halfRange ? roll(weapon.rapidFire, random) : 0)
      for (let attack = 0; attack < attacks; attack++) {
        if (killed === models) break
        const hit = weapon.torrent
          ? { success: true, critical: false, value: 0 }
          : check(
              skill,
              hitBonus,
              weapon.criticalHit ?? 6,
              indirect ? 'none' : bestReroll(options.hitReroll, weapon.hitReroll),
              random,
              indirect ? (options.indirectFire === 'spotted' ? 4 : 6) : 2,
            )
        if (!hit.success) continue
        if (weapon.successfulCriticalHit && hit.value >= weapon.successfulCriticalHit) hit.critical = true
        if (weapon.allHitsCritical && !weapon.torrent) hit.critical = true
        resolveHit(hit.critical && weapon.lethal && options.lethal)
        if (hit.critical && killed < models) {
          const sustained = roll(weapon.sustained, random)
          for (let extra = 0; extra < sustained; extra++) {
            if (killed === models) break
            resolveHit(false)
          }
        }
      }
    }
    // Save rolls resolve from lowest to highest against whichever group is current (05.04).
    const rolls = saves.map((critical) => ({ value: d6(random), critical })).toSorted((a, b) => a.value - b.value)
    for (const save of rolls) {
      if (killed === models) return { damage, killed }
      const group = target.groups[current]!
      if (
        save.value !== 1 &&
        (save.value + weapon.ap + (save.critical ? (weapon.criticalAp ?? 0) : 0) >= group.save ||
          (group.invulnerable !== null && save.value >= group.invulnerable))
      )
        continue
      inflict()
    }
  }
  inflictMortals('after')
  return { damage, killed }
}

export function simulateCombat(scenario: CombatInput): CombatResult {
  const input = combatSchema.parse(scenario)
  if ((input.target.damage ?? 0) >= input.target.groups[0]!.wounds)
    throw new Error('The wounded model must have at least one wound remaining.')
  const models = targetModels(input.target)
  const work = input.weapons.reduce(
    (total, weapon) =>
      total +
      weapon.count *
        (maximum(weapon.attacks) + (weapon.blast + (weapon.cleave ?? 0)) * Math.floor(models / 5) + maximum(weapon.rapidFire)) *
        (1 + maximum(weapon.sustained)) *
        (8 +
          weapon.damage.dice * (weapon.damageReroll ? 2 : 1) +
          (typeof weapon.sustained === 'number' ? 0 : weapon.sustained.dice) +
          (typeof weapon.rapidFire === 'number' ? 0 : weapon.rapidFire.dice) +
          (typeof weapon.melta === 'number' ? 0 : weapon.melta.dice) +
          (input.target.feelNoPain ||
          (weapon.devastating && input.target.mortalFeelNoPain) ||
          (weapon.psychic && input.target.psychicFeelNoPain)
            ? maximum(weapon.damage) + maximum(weapon.melta)
            : 0)),
    (input.mortalWounds ?? []).reduce(
      (total, ability) =>
        total + ability.rolls * (1 + Math.max(...ability.outcomes.map((outcome) => outcome.damage.dice + maximum(outcome.damage)))),
      0,
    ),
  )
  if (work > 15_000) throw new Error('This attack is too large to simulate. Select fewer weapons or models.')
  const trials = Math.min(20_000, Math.floor(30_000_000 / Math.max(1, work)))
  const kills = Array.from({ length: models + 1 }, () => 0)
  const damage = Array.from({ length: targetWounds(input.target) + 1 }, () => 0)
  let seed = 0x12345678
  const random = () => {
    seed = (seed + 0x6d2b79f5) | 0
    let value = Math.imul(seed ^ (seed >>> 15), seed | 1)
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61)
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296
  }
  let totalKills = 0
  let totalDamage = 0
  for (let i = 0; i < trials; i++) {
    const result = attackSequence(input, random)
    kills[result.killed]!++
    damage[result.damage]!++
    totalKills += result.killed
    totalDamage += result.damage
  }
  return {
    trials,
    kills: kills.map((count) => count / trials),
    damage: damage.map((count) => count / trials),
    meanKills: totalKills / trials,
    meanDamage: totalDamage / trials,
    wipe: kills[models]! / trials,
  }
}

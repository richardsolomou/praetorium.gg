import { z } from 'zod'

export const MAX_COMBAT_MODELS = 100

const diceSchema = z.object({ dice: z.int().min(0).max(10), sides: z.union([z.literal(3), z.literal(6)]), bonus: z.int().min(0).max(100) })
const rollTarget = z.int().min(2).max(6)
const reroll = z.enum(['none', 'ones', 'failed'])
const modifier = z.int().min(-1).max(1)

export const combatSchema = z.object({
  target: z.object({
    models: z.int().min(1).max(MAX_COMBAT_MODELS),
    toughness: z.int().min(1).max(100),
    save: z.int().min(2).max(7),
    invulnerable: rollTarget.nullable(),
    wounds: z.int().min(1).max(100),
    feelNoPain: rollTarget.nullable(),
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
        torrent: z.boolean(),
        lethal: z.boolean(),
        sustained: z.int().min(0).max(10),
        devastating: z.boolean(),
        criticalWound: rollTarget,
        twinLinked: z.boolean(),
        ignoresCover: z.boolean(),
        psychic: z.boolean(),
        blast: z.int().min(0).max(10),
        rapidFire: z.int().min(0).max(10),
        melta: z.int().min(0).max(10),
        heavy: z.boolean(),
        lance: z.boolean(),
      }),
    )
    .min(1)
    .max(60),
  options: z.object({
    phase: z.enum(['ranged', 'melee']),
    cover: z.boolean(),
    halfRange: z.boolean(),
    heavy: z.boolean(),
    charged: z.boolean(),
    hitModifier: modifier,
    woundModifier: modifier,
    hitReroll: reroll,
    woundReroll: reroll,
    lethal: z.boolean(),
  }),
})

export type CombatInput = z.infer<typeof combatSchema>
export type CombatWeapon = CombatInput['weapons'][number]
export type CombatOptions = CombatInput['options']
export type DiceExpression = z.infer<typeof diceSchema>
export type CombatResult = { trials: number; kills: number[]; damage: number[]; meanKills: number; meanDamage: number; wipe: number }

export const DEFAULT_COMBAT_OPTIONS: CombatOptions = {
  phase: 'ranged',
  cover: false,
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

export function woundTarget(strength: number, toughness: number) {
  return strength >= toughness * 2 ? 2 : strength > toughness ? 3 : strength === toughness ? 4 : strength * 2 <= toughness ? 6 : 5
}

const cappedModifier = (value: number) => Math.max(-1, Math.min(1, value))
const maximum = (expression: DiceExpression) => expression.dice * expression.sides + expression.bonus
const d6 = (random: () => number) => Math.floor(random() * 6) + 1

function roll(expression: DiceExpression, random: () => number) {
  let result = expression.bonus
  for (let i = 0; i < expression.dice; i++) result += Math.floor(random() * expression.sides) + 1
  return result
}

function check(target: number, bonus: number, critical: number, rerolls: CombatOptions['hitReroll'], random: () => number) {
  const succeeds = (value: number) => value !== 1 && (value >= critical || value + bonus >= target)
  let value = d6(random)
  if ((rerolls === 'ones' && value === 1) || (rerolls === 'failed' && !succeeds(value))) value = d6(random)
  return { success: succeeds(value), critical: value !== 1 && value >= critical }
}

export function attackSequence({ target, weapons, options }: CombatInput, random: () => number) {
  let killed = 0
  let remaining = target.wounds
  let damage = 0
  const ranged = options.phase === 'ranged'
  for (const weapon of weapons) {
    const cover = ranged && options.cover && !weapon.ignoresCover && !weapon.psychic
    const skill = Math.min(6, weapon.skill + Number(cover))
    const hitBonus = cappedModifier(
      (weapon.psychic ? Math.max(0, options.hitModifier) : options.hitModifier) + Number(ranged && weapon.heavy && options.heavy),
    )
    const woundBonus = cappedModifier(options.woundModifier + Number(!ranged && weapon.lance && options.charged))
    const halfRange = ranged && options.halfRange
    const wound = woundTarget(weapon.strength, target.toughness)
    const inflict = () => {
      const rolled = roll(weapon.damage, random) + (halfRange ? weapon.melta : 0)
      let lost = rolled
      if (target.feelNoPain !== null) {
        lost = 0
        for (let i = 0; i < rolled; i++) if (d6(random) < target.feelNoPain) lost++
      }
      damage += Math.min(remaining, lost)
      remaining -= lost
      if (remaining <= 0) {
        killed++
        remaining = target.wounds
      }
    }
    const resolveHit = (automatic: boolean) => {
      const result = automatic
        ? { success: true, critical: false }
        : check(wound, woundBonus, weapon.criticalWound, weapon.twinLinked ? 'failed' : options.woundReroll, random)
      if (!result.success) return
      if (weapon.devastating && result.critical) {
        inflict()
        return
      }
      const save = d6(random)
      if (save !== 1 && (save + weapon.ap >= target.save || (target.invulnerable !== null && save >= target.invulnerable))) return
      inflict()
    }
    for (let carrier = 0; carrier < weapon.count; carrier++) {
      const attacks = roll(weapon.attacks, random) + weapon.blast * Math.floor(target.models / 5) + (halfRange ? weapon.rapidFire : 0)
      for (let attack = 0; attack < attacks; attack++) {
        if (killed === target.models) return { damage, killed }
        const hit = weapon.torrent ? { success: true, critical: false } : check(skill, hitBonus, 6, options.hitReroll, random)
        if (!hit.success) continue
        resolveHit(hit.critical && weapon.lethal && options.lethal)
        if (hit.critical) for (let extra = 0; extra < weapon.sustained && killed < target.models; extra++) resolveHit(false)
      }
    }
  }
  return { damage, killed }
}

export function simulateCombat(scenario: CombatInput): CombatResult {
  const input = combatSchema.parse(scenario)
  const work = input.weapons.reduce(
    (total, weapon) =>
      total +
      weapon.count *
        (maximum(weapon.attacks) + weapon.blast * Math.floor(input.target.models / 5) + weapon.rapidFire) *
        (1 + weapon.sustained) *
        (8 + weapon.damage.dice + (input.target.feelNoPain ? maximum(weapon.damage) + weapon.melta : 0)),
    0,
  )
  if (work > 15_000) throw new Error('This attack is too large to simulate. Select fewer weapons or models.')
  const trials = Math.min(20_000, Math.floor(30_000_000 / Math.max(1, work)))
  const kills = Array.from({ length: input.target.models + 1 }, () => 0)
  const damage = Array.from({ length: input.target.models * input.target.wounds + 1 }, () => 0)
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
    wipe: kills[input.target.models]! / trials,
  }
}

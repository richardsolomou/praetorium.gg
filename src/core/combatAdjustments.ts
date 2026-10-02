import { z } from 'zod'
import { combatSchema, rerollRank, type CombatInput, type CombatWeapon, type DiceExpression } from './combat'

const step = z.int().min(-10).max(10)
const roll = z.int().min(2).max(6)

/** Situational changes to one phase's attacks, from rules the datasheet and its switches do not already apply. */
export const weaponAdjustmentSchema = z.object({
  skill: step.optional(),
  strength: step.optional(),
  attacks: step.optional(),
  ap: step.optional(),
  damage: step.optional(),
  criticalHit: roll.optional(),
  criticalWound: roll.optional(),
  sustained: combatSchema.shape.weapons.element.shape.sustained.optional(),
  lethal: z.boolean().optional(),
  devastating: z.boolean().optional(),
  damageReroll: z.boolean().optional(),
})
export type WeaponAdjustment = z.infer<typeof weaponAdjustmentSchema>

/** Situational changes to the defending unit, for both phases. */
export const targetAdjustmentSchema = z.object({
  toughness: step.optional(),
  save: step.optional(),
  invulnerable: roll.nullable().optional(),
  saveReroll: z.enum(['ones', 'failed']).optional(),
  damageReduction: z.boolean().optional(),
  halveDamage: z.boolean().optional(),
})
export type TargetAdjustment = z.infer<typeof targetAdjustmentSchema>

const attackAdjustmentSchema = combatSchema.shape.options.omit({ phase: true }).partial()
type AttackAdjustment = z.infer<typeof attackAdjustmentSchema>

/** Situational extras layered over the datasheet and its rules; each combines the way the game combines two sources. */
export const combatAdjustmentsSchema = z.object({
  all: attackAdjustmentSchema.optional(),
  ranged: attackAdjustmentSchema.optional(),
  melee: attackAdjustmentSchema.optional(),
  weapons: z.object({ all: weaponAdjustmentSchema, ranged: weaponAdjustmentSchema, melee: weaponAdjustmentSchema }).partial().optional(),
  target: targetAdjustmentSchema.optional(),
  feelNoPain: roll.nullable().optional(),
})
export type CombatAdjustments = z.infer<typeof combatAdjustmentsSchema>

/** A phase chooses its own grants, while numeric modifiers from both scopes cancel or accumulate. */
export function combineAttackAdjustments(all: AttackAdjustment, phase: AttackAdjustment): AttackAdjustment {
  return {
    ...all,
    ...Object.fromEntries(Object.entries(phase).filter(([, value]) => value !== undefined)),
    hitModifier: (all.hitModifier ?? 0) + (phase.hitModifier ?? 0),
    woundModifier: (all.woundModifier ?? 0) + (phase.woundModifier ?? 0),
  }
}

export function combineWeaponAdjustments(all: WeaponAdjustment, phase: WeaponAdjustment): WeaponAdjustment {
  return {
    ...all,
    ...Object.fromEntries(Object.entries(phase).filter(([, value]) => value !== undefined)),
    skill: (all.skill ?? 0) + (phase.skill ?? 0),
    strength: (all.strength ?? 0) + (phase.strength ?? 0),
    attacks: (all.attacks ?? 0) + (phase.attacks ?? 0),
    ap: (all.ap ?? 0) + (phase.ap ?? 0),
    damage: (all.damage ?? 0) + (phase.damage ?? 0),
  }
}

const average = (amount: CombatWeapon['sustained']) =>
  typeof amount === 'number' ? amount : (amount.dice * (amount.sides + 1)) / 2 + amount.bonus
/** A changed flat value stays at least 1; a dice value keeps its dice and never subtracts below them. */
const plus = (dice: DiceExpression, bonus: number) => (bonus ? { ...dice, bonus: Math.max(dice.dice ? 0 : 1, dice.bonus + bonus) } : dice)
const between = (value: number, low: number, high: number) => Math.min(high, Math.max(low, value))

/** A granted ability the weapon already has keeps whichever version is better. */
export function adjustCombatWeapon(weapon: CombatWeapon, adjustment: WeaponAdjustment): CombatWeapon {
  return {
    ...weapon,
    skill: between(weapon.skill - (adjustment.skill ?? 0), 2, 6),
    strength: Math.max(1, weapon.strength + (adjustment.strength ?? 0)),
    attacks: plus(weapon.attacks, adjustment.attacks ?? 0),
    ap: between(weapon.ap - (adjustment.ap ?? 0), -10, 0),
    damage: plus(weapon.damage, adjustment.damage ?? 0),
    ...(adjustment.criticalHit ? { criticalHit: Math.min(weapon.criticalHit ?? 6, adjustment.criticalHit) } : {}),
    criticalWound: Math.min(weapon.criticalWound, adjustment.criticalWound ?? 6),
    sustained: adjustment.sustained && average(adjustment.sustained) > average(weapon.sustained) ? adjustment.sustained : weapon.sustained,
    lethal: weapon.lethal || Boolean(adjustment.lethal),
    devastating: weapon.devastating || Boolean(adjustment.devastating),
    ...(adjustment.damageReroll || weapon.damageReroll ? { damageReroll: 'ones' as const } : {}),
  }
}

/** Characteristic changes clamp to what a dice roll can use; an extra invulnerable save only ever improves the printed one. */
export function adjustCombatTarget(target: CombatInput['target'], adjustment: TargetAdjustment): CombatInput['target'] {
  const extra = adjustment.invulnerable
  return {
    ...target,
    groups: target.groups.map((group) => ({
      ...group,
      toughness: Math.max(1, group.toughness + (adjustment.toughness ?? 0)),
      save: between(group.save - (adjustment.save ?? 0), 2, 7),
      invulnerable: extra && (group.invulnerable === null || extra < group.invulnerable) ? extra : group.invulnerable,
    })),
    ...(adjustment.saveReroll && rerollRank[adjustment.saveReroll] > rerollRank[target.saveReroll ?? 'none']
      ? { saveReroll: adjustment.saveReroll }
      : {}),
    ...(adjustment.damageReduction ? { damageReduction: (target.damageReduction ?? 0) + 1 } : {}),
    ...(adjustment.halveDamage ? { damageDivisor: Math.max(target.damageDivisor ?? 1, 2) } : {}),
  }
}

import type { CombatInput, CombatWeapon, DiceExpression } from './combat'

type Amount = CombatWeapon['sustained']

/** Situational changes to one phase's attacks, from rules the datasheet and its switches do not already apply. */
export type WeaponAdjustment = {
  skill?: number
  strength?: number
  attacks?: number
  ap?: number
  damage?: number
  criticalHit?: number
  criticalWound?: number
  sustained?: Amount
  lethal?: boolean
  devastating?: boolean
  damageReroll?: boolean
}

/** Situational changes to the defending unit, for both phases. */
export type TargetAdjustment = {
  toughness?: number
  save?: number
  invulnerable?: number | null
  saveReroll?: 'ones' | 'failed'
  damageReduction?: boolean
  halveDamage?: boolean
}

const average = (amount: Amount) => (typeof amount === 'number' ? amount : (amount.dice * (amount.sides + 1)) / 2 + amount.bonus)
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
    ...(adjustment.saveReroll ? { saveReroll: adjustment.saveReroll } : {}),
    ...(adjustment.damageReduction ? { damageReduction: (target.damageReduction ?? 0) + 1 } : {}),
    ...(adjustment.halveDamage ? { damageDivisor: Math.max(target.damageDivisor ?? 1, 2) } : {}),
  }
}

import type { Datasheet } from '../contracts/catalogue'
import type { CombatInput, CombatOptions } from './combat'
import { adjustCombatWeapon, type WeaponAdjustment } from './combatAdjustments'
import type { CombatCarrier } from './combatLoadout'
import { combatPlan } from './combatProfiles'
import { combatRuleMortals, combatRuleProfiles, combatRuleWeapons, type ActiveCombatRule } from './combatRules'

type Phase = CombatOptions['phase']
export type CombatAttacker = {
  sheet: Datasheet
  carriers: readonly CombatCarrier[]
  models: number
  rules?: readonly ActiveCombatRule[]
}
export type CombatOpponent = { keywords: readonly string[]; rules: readonly ActiveCombatRule[] }
export type CombatAttack = ReturnType<typeof combatAttacks>[Phase]

/** Which weapons attack in each phase once the attacker's and the defender's rules apply. */
export function combatAttacks(
  attacker: CombatAttacker,
  defender: CombatOpponent,
  preferences: Readonly<Record<string, string>>,
  excluded: Readonly<Record<Phase, readonly string[]>>,
) {
  const rules = attacker.rules ?? []
  const sheet = combatRuleProfiles(attacker.sheet, rules, 'attacker', defender.keywords, defender.rules)
  const attack = (phase: Phase) => {
    const plan = combatPlan(sheet, attacker.carriers, defender.keywords, phase, preferences, new Set(excluded[phase]))
    if (plan.errors.length) return { plan, base: null }
    const mortalWounds = combatRuleMortals(rules, phase, defender.keywords, plan.active, attacker.models)
    const weapons = combatRuleWeapons(
      attacker.sheet,
      combatRuleWeapons(attacker.sheet, plan.active, rules, 'attacker', phase, defender.keywords).map((weapon, index) => ({
        weapon,
        count: weapon.count,
        profile: plan.active[index]!.profile,
      })),
      defender.rules,
      'defender',
      phase,
      attacker.sheet.keywords,
    )
    return { plan, base: { weapons, mortalWounds } }
  }
  return { ranged: attack('ranged'), melee: attack('melee') }
}

/** The calculation for one phase, or null when nothing in it can attack. */
export function combatAttackInput(
  { plan, base }: CombatAttack,
  target: CombatInput['target'] | null,
  options: CombatOptions,
  adjustment: WeaponAdjustment,
): CombatInput | null {
  return target && base && (plan.weapons.length || base.mortalWounds.length)
    ? {
        target,
        weapons: base.weapons.map((weapon) => adjustCombatWeapon(weapon, adjustment)),
        options,
        ...(base.mortalWounds.length ? { mortalWounds: base.mortalWounds } : {}),
      }
    : null
}

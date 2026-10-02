import type { Datasheet } from './datasheet'
import type { CombatInput, CombatOptions, CombatWeapon } from './combat'
import { adjustCombatWeapon, type WeaponAdjustment } from './combatAdjustments'
import type { CombatCarrier } from './combatLoadout'
import { combatPlan, combatWeapons } from './combatProfiles'
import { combatRuleMortals, combatRuleProfiles, combatRuleWeapons, type ActiveCombatRule } from './combatRules'
import type { StructuredDatasheetProfile } from './datasheet'

type Phase = CombatOptions['phase']
export type CombatAttacker = {
  sheet: Datasheet
  carriers: readonly CombatCarrier[]
  models: number
  rules?: readonly ActiveCombatRule[]
}
export type CombatOpponent = { keywords: readonly string[]; rules: readonly ActiveCombatRule[] }
export type CombatAttack = ReturnType<typeof combatAttacks>[Phase]

type CarriedWeapon = { weapon: CombatWeapon | null; count: number; profile: StructuredDatasheetProfile }

/** The weapons and separate mortal wounds an attack makes once both units' rules apply. */
function ruledAttack(attacker: CombatAttacker, defender: CombatOpponent, phase: Phase, active: readonly CarriedWeapon[]) {
  const rules = attacker.rules ?? []
  const mortalWounds = combatRuleMortals(rules, phase, defender.keywords, active, attacker.models)
  const weapons = combatRuleWeapons(
    attacker.sheet,
    combatRuleWeapons(attacker.sheet, active, rules, 'attacker', phase, defender.keywords).map((weapon, index) => ({
      weapon,
      count: weapon.count,
      profile: active[index]!.profile,
    })),
    defender.rules,
    'defender',
    phase,
    attacker.sheet.keywords,
  )
  return { weapons, mortalWounds }
}

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
    return { plan, base: plan.errors.length ? null : ruledAttack(attacker, defender, phase, plan.active) }
  }
  return { ranged: attack('ranged'), melee: attack('melee') }
}

/** The calculation for one phase, or null when nothing in it can attack. */
export function combatAttackInput(
  { base }: Pick<CombatAttack, 'base'>,
  target: CombatInput['target'] | null,
  options: CombatOptions,
  adjustment: WeaponAdjustment,
): CombatInput | null {
  return target && base && (base.weapons.length || base.mortalWounds.length)
    ? {
        target,
        weapons: base.weapons.map((weapon) => adjustCombatWeapon(weapon, adjustment)),
        options,
        ...(base.mortalWounds.length ? { mortalWounds: base.mortalWounds } : {}),
      }
    : null
}

/** Each weapon profile the attacker carries in a phase, resolved alone by every model carrying it. */
export function combatWeaponInputs(
  attacker: CombatAttacker,
  defender: CombatOpponent,
  phase: Phase,
  target: CombatInput['target'],
  options: CombatOptions,
  adjustment: WeaponAdjustment,
) {
  const sheet = combatRuleProfiles(attacker.sheet, attacker.rules ?? [], 'attacker', defender.keywords, defender.rules)
  return combatWeapons(sheet, defender.keywords, phase).flatMap(({ profile, weapon }) => {
    if (!weapon) return []
    const base = ruledAttack(attacker, defender, phase, [{ weapon, count: weapon.count, profile }])
    const input = combatAttackInput({ base }, target, options, adjustment)
    return input ? [{ profile, input }] : []
  })
}

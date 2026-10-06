import type { Datasheet } from './datasheet'
import { MAX_COMBAT_MODELS, type CombatInput, type CombatOptions, type CombatWeapon } from './combat'
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
  companions?: readonly CombatAttacker[]
}
export type CombatOpponent = { keywords: readonly string[]; rules: readonly ActiveCombatRule[] }
export type CombatAttack = ReturnType<typeof combatAttacks>[Phase]

type CarriedWeapon = { weapon: CombatWeapon | null; count: number; profile: StructuredDatasheetProfile }

/** The weapons and separate mortal wounds an attack makes once both units' rules apply. */
function ruledAttack(
  attacker: CombatAttacker,
  defender: CombatOpponent,
  phase: Phase,
  active: readonly CarriedWeapon[],
  scopedOptions = false,
) {
  const rules = attacker.rules ?? []
  const mortalWounds = combatRuleMortals(rules, phase, defender.keywords, active, attacker.models)
  const weapons = combatRuleWeapons(
    attacker.sheet,
    combatRuleWeapons(attacker.sheet, active, rules, 'attacker', phase, defender.keywords, scopedOptions).map((weapon, index) => ({
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
  if (attacker.companions?.length) {
    const members = [attacker, ...attacker.companions]
    const attack = (phase: Phase) => {
      const tooMany = members.reduce((total, member) => total + member.models, 0) > MAX_COMBAT_MODELS
      const parts = members.map((member, index) => {
        const prefix = index ? `attached:${index}:` : ''
        const rules = member.rules ?? []
        const sheet = combatRuleProfiles(member.sheet, rules, 'attacker', defender.keywords, defender.rules)
        const localPreferences = Object.fromEntries(
          Object.entries(preferences)
            .filter(([key]) => !prefix || key.startsWith(prefix))
            .map(([key, value]) => [prefix ? key.slice(prefix.length) : key, value]),
        )
        const plan = combatPlan(sheet, member.carriers, defender.keywords, phase, localPreferences, new Set(excluded[phase]))
        return {
          plan: { ...plan, choices: plan.choices.map((choice) => ({ ...choice, key: `${prefix}${choice.key}` })) },
          base: plan.errors.length ? null : ruledAttack(member, defender, phase, plan.active, true),
        }
      })
      return {
        plan: {
          used: parts.flatMap((part) => part.plan.used),
          active: parts.flatMap((part) => part.plan.active),
          choices: parts.flatMap((part) => part.plan.choices),
          errors: [
            ...parts.flatMap((part) => part.plan.errors),
            ...(tooMany ? ['This attached unit exceeds the supported model limit.'] : []),
          ],
          weapons: parts.flatMap((part) => part.plan.weapons),
        },
        base:
          !tooMany && parts.every((part) => part.base)
            ? {
                weapons: parts.flatMap((part) => part.base!.weapons),
                mortalWounds: parts.flatMap((part) => part.base!.mortalWounds),
              }
            : null,
      }
    }
    return { ranged: attack('ranged'), melee: attack('melee') }
  }
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
    const base = ruledAttack(attacker, defender, phase, [{ weapon, count: weapon.count, profile }], Boolean(attacker.companions?.length))
    const input = combatAttackInput({ base }, target, options, adjustment)
    return input ? [{ profile, input }] : []
  })
}

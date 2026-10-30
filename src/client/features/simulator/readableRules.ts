import { type CombatRule, readCombatRule } from '../../../core/combatRules'
import { hasTextTokens } from '../../../shared/sourceText'
import { loadedWords } from '../../sourceText'

/**
 * A combatant's rules as the simulator can compile them: rules are compiled from their
 * words, so a rule whose text this device has not loaded takes no part rather than a
 * guessed one.
 */
export function readableRules(rules: readonly CombatRule[]): CombatRule[] {
  return rules.flatMap((rule) => {
    if (!hasTextTokens(rule.description)) return [rule]
    const description = loadedWords(rule.description)
    return (description !== null && readCombatRule(rule, description)) || []
  })
}

export function readableCombatant<T extends { rules: CombatRule[]; companions: { rules: CombatRule[] }[] }>(data: T): T {
  return {
    ...data,
    rules: readableRules(data.rules),
    companions: data.companions.map((member) => ({ ...member, rules: readableRules(member.rules) })),
  }
}

/** Every rule text a combatant carries, for loading what they name. */
export const combatantTexts = (data: { rules: CombatRule[]; companions: { rules: CombatRule[] }[] } | null | undefined) =>
  data ? [...data.rules, ...data.companions.flatMap((member) => member.rules)].map((rule) => rule.description) : []

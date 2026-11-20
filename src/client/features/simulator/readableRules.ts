import type { CombatRule } from '../../../core/combatRules'
import { hasTextTokens } from '../../../core/sourceText'

export function readableRules(rules: readonly CombatRule[]) {
  return rules.filter((rule) => rule.reading || !hasTextTokens(rule.description))
}

export function readableCombatant<T extends { rules: CombatRule[]; companions: { rules: CombatRule[] }[] }>(data: T): T {
  return {
    ...data,
    rules: readableRules(data.rules),
    companions: data.companions.map((member) => ({ ...member, rules: readableRules(member.rules) })),
  }
}

import type { CombatRule } from '../../../core/combatRules'
import { hasTextTokens } from '../../../core/sourceText'

/**
 * A combatant's rules as the simulator can compile them in the browser, which never holds a source's words: a rule
 * named by its words' token takes part only where the server recorded what it reads, never a guessed one.
 */
export function readableRules(rules: readonly CombatRule[]): CombatRule[] {
  return rules.filter((rule) => rule.reading || !hasTextTokens(rule.description))
}

export function readableCombatant<T extends { rules: CombatRule[]; companions: { rules: CombatRule[] }[] }>(data: T): T {
  return {
    ...data,
    rules: readableRules(data.rules),
    companions: data.companions.map((member) => ({ ...member, rules: readableRules(member.rules) })),
  }
}

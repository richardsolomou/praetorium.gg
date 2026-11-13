import { type CombatRule, readCombatRule } from '../../../core/combatRules'
import { hasTextTokens } from '../../../core/sourceText'
import { loadedText, loadedWords, type MissingText } from '../../sourceText'

/**
 * A combatant's rules as the simulator can compile them: rules are compiled from their
 * words or from what was recorded of them, so a rule whose text this device has not
 * loaded and nothing recorded takes no part rather than a guessed one. A recorded rule
 * whose words have loaded is read from them, so its choices are labelled in its own words.
 */
export function readableRules(rules: readonly CombatRule[]): CombatRule[] {
  return rules.flatMap((rule) => {
    if (!hasTextTokens(rule.description)) return [rule]
    if (rule.reading) {
      const words = loadedWords(rule.description)
      return [words === null ? rule : { ...rule, description: words, reading: undefined }]
    }
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

/** Why some of a combatant's rules cannot be read yet, worst first, so a side can say rather than drop them silently. */
export function missingRuleText(data: Parameters<typeof combatantTexts>[0]): Exclude<MissingText, 'unavailable'> {
  const unread = data ? [...data.rules, ...data.companions.flatMap((member) => member.rules)].filter((rule) => !rule.reading) : []
  const missing = new Set(unread.map((rule) => loadedText(rule.description).missing))
  return (['unchosen', 'failed', 'loading'] as const).find((reason) => missing.has(reason)) ?? null
}

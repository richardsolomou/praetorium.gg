import { readCombatRule, type CombatRule, type combatRuleSelections } from '../core/combatRules'
import type { CombatantSnapshot } from '../core/combatMatchup'
import { hasTextTokens } from '../shared/sourceText'
import type { LoadedCatalogue } from '../shared/catalogueIndex'
import type { LoadedRules } from '../shared/rules'
import { rosterCombatant } from '../shared/rosterCombatRules'
import { serverWords } from './publishedTextFiles'

export type CombatProjection = NonNullable<ReturnType<typeof rosterCombatant>>

/** One roster unit and the units joined to it, with each rule read from the snapshot's words where it holds them. */
export async function readRosterCombatant(
  loaded: LoadedCatalogue,
  rules: LoadedRules | null,
  data: Parameters<typeof rosterCombatant>[2],
): Promise<CombatProjection | null> {
  const projection = rosterCombatant(loaded, rules, data)
  if (!projection) return null
  const words = await serverWords()
  // A rule whose words the snapshot does not hold stays a token, which callers report as not calculated.
  const read = (unread: readonly CombatRule[]) =>
    unread.flatMap((rule) => {
      if (!hasTextTokens(rule.description)) return [rule]
      const description = words(rule.description)
      return description === null ? [rule] : (readCombatRule(rule, description) ?? [])
    })
  return {
    ...projection,
    rules: read(projection.rules),
    companions: projection.companions.map((member) => ({ ...member, rules: read(member.rules) })),
  }
}

/** The unit at full strength with the selected rules active, as the simulator fields it. */
export function combatantSnapshot(projection: CombatProjection, selection: ReturnType<typeof combatRuleSelections>): CombatantSnapshot {
  return {
    sheet: projection.selected,
    bodyguard: true,
    models: projection.models,
    startingModels: projection.models,
    damage: 0,
    carriers: projection.carriers,
    rules: selection.active(projection.rules),
    ruleChoices: selection.choices,
    appliedDefenceSources: selection.appliedDefenceSources(projection.rules),
    companions: projection.companions.map((member) => ({
      sheet: member.selected,
      bodyguard: false,
      models: member.models,
      startingModels: member.models,
      damage: 0,
      carriers: member.carriers,
      rules: selection.active(member.rules),
      appliedDefenceSources: selection.appliedDefenceSources(member.rules),
    })),
  }
}

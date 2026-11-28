import type { CombatRule } from '../../../core/combatRules'
import { HoverTooltip } from '../../components/HoverTooltip'
import type { KeywordRule } from '../../components/Keyword'
import { RuleText } from '../../components/RuleText'
import { DatasheetUnit } from '../../components/UnitFromVsData'

/**
 * What finds a combat rule's summary as its datasheet finds it: a unit's ability by its BSData id and name, an army rule
 * by its name, and a Detachment rule or Stratagem by its words alone, since the unit around it does not own them.
 */
export function combatRuleLookup({ id, name }: Pick<CombatRule, 'id' | 'name'>): { name?: string; abilityId?: string } {
  if (id.startsWith('unit:')) return { name, abilityId: id.slice('unit:'.length) }
  return id.startsWith('army:') ? { name } : {}
}

export function CombatRuleLabel({
  side,
  rule,
  owner,
  rules,
}: {
  side: string
  rule: Pick<CombatRule, 'id' | 'name' | 'description'>
  /** The `datasheetUnit` of the datasheet holding the rule, whose records its summary is read from. */
  owner: string | null
  rules?: KeywordRule[]
}) {
  return (
    <HoverTooltip
      label={`${side} ${rule.name} rules`}
      title={rule.name}
      className="min-w-0 text-left text-sm text-bone"
      body={
        rule.description ? (
          <DatasheetUnit.Provider value={owner}>
            <RuleText text={rule.description} rules={rules} className="mt-0 text-xs" {...combatRuleLookup(rule)} />
          </DatasheetUnit.Provider>
        ) : (
          'No description available.'
        )
      }
    >
      {rule.name}
    </HoverTooltip>
  )
}

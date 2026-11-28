import type { CombatRule } from '../../../core/combatRules'
import type { Datasheet } from '../../../core/datasheet'
import { HoverTooltip } from '../../components/HoverTooltip'
import type { KeywordRule } from '../../components/Keyword'
import { RuleText } from '../../components/RuleText'
import { DatasheetUnit } from '../../components/UnitFromVsData'

/** Whose records a unit's combat rules read: the unit's own abilities, and each detachment's owner by detachment id. */
export type CombatRuleOwners = {
  abilities: readonly Pick<Datasheet['abilities'][number], 'id' | 'kind' | 'source'>[]
  detachments?: Readonly<Record<string, string>>
}

/**
 * Whether an ability is the unit's own record: its wargear and datasheet abilities, which the catalogue may name apart
 * from their entry, and a faction or core ability it was not granted; an upgrade is its detachment's.
 */
export const ownAbility = ({ kind, source }: Pick<Datasheet['abilities'][number], 'kind' | 'source'>) =>
  kind === 'wargear' || kind === 'datasheet' || (kind !== 'upgrade' && !source)

/**
 * What finds a combat rule's summary as its datasheet finds it: the unit's own ability by its BSData id and name, an army
 * rule by its name, and a detachment rule by its name under the detachment. An enhancement or a granted ability, which
 * its detachment owns, reads by its id alone, so the unit around it never filters its record out; a Stratagem by its words.
 */
export function combatRuleLookup(
  { id, name }: Pick<CombatRule, 'id' | 'name'>,
  owners: CombatRuleOwners,
): { name?: string; abilityId?: string; owner?: string } {
  const [kind, held] = id.split(':')
  if (kind === 'unit') {
    const ability = owners.abilities.find((candidate) => candidate.id === held)
    return ability && ownAbility(ability) ? { name, abilityId: held } : { abilityId: held }
  }
  if (kind === 'army') return { name }
  const owner = kind === 'detachment' && held ? owners.detachments?.[held] : undefined
  return owner ? { name, owner } : {}
}

export function CombatRuleSummary({
  rule,
  owners,
  rules,
  className,
}: {
  rule: Pick<CombatRule, 'id' | 'name' | 'description'>
  owners: CombatRuleOwners
  rules?: KeywordRule[]
  className?: string
}) {
  const { owner, ...lookup } = combatRuleLookup(rule, owners)
  const text = <RuleText text={rule.description} rules={rules} className={className} {...lookup} />
  return owner ? <DatasheetUnit.Provider value={owner}>{text}</DatasheetUnit.Provider> : text
}

export function CombatRuleLabel({
  side,
  rule,
  unit,
  owners,
  rules,
}: {
  side: string
  rule: Pick<CombatRule, 'id' | 'name' | 'description'>
  /** The `datasheetUnit` of the datasheet holding the rule, whose records its summary is read from. */
  unit: string | null
  owners: CombatRuleOwners
  rules?: KeywordRule[]
}) {
  return (
    <HoverTooltip
      label={`${side} ${rule.name} rules`}
      title={rule.name}
      className="min-w-0 text-left text-sm text-bone"
      body={
        rule.description ? (
          <DatasheetUnit.Provider value={unit}>
            <CombatRuleSummary rule={rule} owners={owners} rules={rules} className="mt-0 text-xs" />
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

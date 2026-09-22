import { attachedUnit } from '../core/attach'
import { combatRuleEligible, combatRuleIsRelevant, combatRuleRecipient, type CombatRule } from '../core/combatRules'
import { datasheetCharacteristicKind, datasheetProfileKind } from '../core/datasheetStructure'
import { routeSlug } from '../core/slug'
import { datasheetIn, datasheetAbilitiesIn } from './catalogue'
import { combatCarriers } from '../core/combatLoadout'
import type { Datasheet } from '../contracts/catalogue'
import type { LoadedCatalogue } from './catalogueIndex'
import { describeDatasheetAbilities } from './datasheetDescriptions'
import { detachmentReference } from './detachmentReference'
import { rosterDatasheetContext } from './rosterDatasheetContext'
import { type LoadedRules, rulesFaction } from './rules'
import { selectedDetachmentRules } from './selectedDetachmentRules'

export function rosterCombatant(
  loaded: LoadedCatalogue,
  rules: LoadedRules | null,
  data: Parameters<typeof rosterDatasheetContext>[1] & { inactivePicks?: number[] },
) {
  const context = rosterDatasheetContext(loaded, data)
  if (!context || data.pickIndex === null) return null
  const selectedPick = data.picks[data.pickIndex]
  if (!selectedPick) return null
  const sheet = describeDatasheetAbilities(
    loaded,
    selectedPick.catalogueId ?? data.catalogueId,
    datasheetIn(loaded, data.catalogueId, selectedPick.entryId, context),
    rules,
  )
  if (!sheet) return null
  return {
    selected: sheet,
    carriers: combatCarriers(context.selections[context.unitSelectionIndex]!, loaded.index),
    rules: rosterCombatRules(loaded, rules, data, context, sheet),
  }
}

function rosterCombatRules(
  loaded: LoadedCatalogue,
  rules: LoadedRules | null,
  data: Parameters<typeof rosterDatasheetContext>[1] & { inactivePicks?: number[] },
  context: NonNullable<ReturnType<typeof rosterDatasheetContext>>,
  sheet: Datasheet,
) {
  const selectedPick = data.picks[data.pickIndex!]!
  const modelProfiles = sheet.profiles.filter((profile) => datasheetProfileKind(profile.type) === 'unit')
  const candidates: CombatRule[] = []
  const supportKeywords = [sheet.keywords]
  const add = (rule: CombatRule) => {
    const recipient = rule.scope === 'stratagem' ? combatRuleRecipient(rule.description) : undefined
    if (
      combatRuleIsRelevant({
        ...rule,
        models: context.unitSelections.find((unit) => unit.pickIndex === data.pickIndex)?.models,
        keywords: sheet.keywords,
      }) &&
      (combatRuleEligible(rule.description, sheet.keywords) ||
        (recipient &&
          combatRuleEligible(rule.description, sheet.keywords, recipient) &&
          supportKeywords.some((keywords) => combatRuleEligible(rule.description, keywords))))
    )
      candidates.push({
        ...rule,
        appliedDefences: (['save', 'invulnerable-save', 'toughness'] as const).filter(
          (kind) =>
            modelProfiles.length &&
            modelProfiles.every((profile) =>
              profile.values.some((value) => datasheetCharacteristicKind(value.name) === kind && value.modifiers?.includes(rule.name)),
            ),
        ),
        models: context.unitSelections.find((unit) => unit.pickIndex === data.pickIndex)?.models,
        keywords: sheet.keywords,
      })
  }
  for (const ability of sheet.abilities) {
    if (!ability.description || /select (?:one|a) other friendly/i.test(ability.description)) continue
    add({
      id: `unit:${ability.id}`,
      name: ability.name,
      source: sheet.name,
      description: ability.description,
      scope:
        selectedPick.attachedTo !== undefined && /^While this model is leading a unit,/i.test(ability.description) ? 'attached' : 'unit',
      included: ability.kind === 'core' && /^Feel No Pain [2-6]\+$/.test(ability.name),
    })
  }
  const attached = attachedUnit(data.picks, data.pickIndex!)
  for (const unit of context.unitSelections) {
    if (unit.pickIndex === data.pickIndex || data.inactivePicks?.includes(unit.pickIndex)) continue
    const pick = data.picks[unit.pickIndex]!
    const source = datasheetAbilitiesIn(loaded, pick.catalogueId ?? data.catalogueId, pick.entryId, {
      selections: context.selections,
      unitSelectionIndex: unit.selectionIndex,
    })
    if (source) supportKeywords.push(source.keywords)
    for (const ability of source?.abilities ?? []) {
      if (!ability.description || ability.kind === 'core' || ability.kind === 'faction') continue
      const linked =
        attached.includes(unit.pickIndex) &&
        /leading a unit|this model[’']s unit|bearer[’']s unit|models in (?:this|that) unit/i.test(ability.description)
      const nearby = Boolean(combatRuleRecipient(ability.description))
      if (!linked && !nearby) continue
      add({
        id: `roster:${ability.id}`,
        name: ability.name,
        source: source!.name,
        description: ability.description,
        scope: linked ? 'attached' : 'nearby',
      })
    }
  }
  if (rules) {
    const options = loaded.detachments.get(data.catalogueId)?.options.filter((option) => data.detachmentIds.includes(option.id)) ?? []
    const faction = loaded.index.catalogues.get(data.catalogueId)
    const factionKey = faction ? rulesFaction(rules, routeSlug(faction.name)) : ''
    const selected = selectedDetachmentRules(
      options.map((option) => option.name),
      rules.byDetachment.get(factionKey),
      rules.detachmentDetails.get(factionKey),
    )
    const core = rules.core.flatMap((stratagem) => {
      const detail = rules.coreDetails.find((card) => card.id === stratagem.key)
      return detail ? [{ ...detail, name: stratagem.name, cp: stratagem.cp, phases: stratagem.phases ?? [] }] : []
    })
    for (const stratagem of [...selected.written, ...core]) {
      if (!stratagem.description) continue
      const phases: CombatRule['phases'] = []
      if (!stratagem.phases.length || stratagem.phases.includes('shooting')) phases.push('ranged')
      if (!stratagem.phases.length || stratagem.phases.includes('fight')) phases.push('melee')
      if (!phases.length) continue
      add({
        id: `stratagem:${stratagem.id}`,
        name: stratagem.name,
        source: `${stratagem.cp} CP`,
        description: stratagem.description,
        scope: 'stratagem',
        phases,
      })
    }
    for (const option of options) {
      for (const rule of detachmentReference(loaded, rules, data.catalogueId, routeSlug(option.name))?.rules ?? []) {
        if (rule.description)
          add({
            id: `detachment:${option.id}:${rule.name}`,
            name: rule.name,
            source: option.name,
            description: rule.description,
            scope: 'detachment',
          })
      }
    }
  }
  return [...new Map(candidates.map((candidate) => [candidate.id, candidate])).values()]
}

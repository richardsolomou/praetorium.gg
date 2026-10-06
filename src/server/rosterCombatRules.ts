import { attachedUnit, attachmentErrors } from '../core/attach'
import { combatRuleEligible, combatRuleIsRelevant, combatRuleRecipient, type CombatRule } from '../core/combatRules'
import { datasheetCharacteristicKind, datasheetProfileKind } from '../core/datasheetStructure'
import { routeSlug } from '../core/slug'
import { datasheetIn, datasheetAbilitiesIn } from './catalogue'
import { combatCarriers } from '../core/combatLoadout'
import type { Datasheet } from '../contracts/catalogue'
import type { LoadedCatalogue } from './catalogueIndex'
import { describeDatasheetAbilities } from './datasheetDescriptions'
import { detachmentReference } from './detachmentReference'
import { buildRosterPick, rosterDatasheetContext } from './rosterDatasheetContext'
import { type LoadedRules, rulesFaction } from './rules'
import { selectedDetachmentRules } from './selectedDetachmentRules'

export function rosterCombatant(
  loaded: LoadedCatalogue,
  rules: LoadedRules | null,
  data: Parameters<typeof rosterDatasheetContext>[1] & { inactivePicks?: number[] },
) {
  data = {
    ...data,
    picks: data.picks.map((pick, index) => (data.inactivePicks?.includes(index) ? { ...pick, attachedTo: undefined } : pick)),
  }
  const projected = rosterDatasheetContext(loaded, data)
  const context = projected && {
    ...projected,
    companions: projected.companions.filter((selectionIndex) =>
      projected.unitSelections.some((unit) => unit.selectionIndex === selectionIndex && !data.inactivePicks?.includes(unit.pickIndex)),
    ),
  }
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
  const members = [data.pickIndex, ...attachedUnit(data.picks, data.pickIndex)].filter((index) => !data.inactivePicks?.includes(index))
  const projectionErrors: { entryId: string; entryName: string; message: string }[] = []
  const companions = members
    .filter((index) => index !== data.pickIndex)
    .flatMap((pickIndex) => {
      const pick = data.picks[pickIndex]!
      const unit = context.unitSelections.find((candidate) => candidate.pickIndex === pickIndex)
      const unavailable = () => {
        projectionErrors.push({ entryId: pick.entryId, entryName: pick.entryId, message: 'attached unit could not be loaded' })
        return []
      }
      if (!unit) return unavailable()
      const memberContext = {
        ...context,
        unitSelectionIndex: unit.selectionIndex,
        companions: context.unitSelections
          .filter((candidate) => members.includes(candidate.pickIndex) && candidate.pickIndex !== pickIndex)
          .map((candidate) => candidate.selectionIndex),
      }
      const selected = describeDatasheetAbilities(
        loaded,
        pick.catalogueId ?? data.catalogueId,
        datasheetIn(loaded, data.catalogueId, pick.entryId, memberContext),
        rules,
      )
      if (!selected) return unavailable()
      const prefix = `attached:${pickIndex}:`
      const carriers = combatCarriers(context.selections[unit.selectionIndex]!, loaded.index, {
        primaryCatalogueId: data.catalogueId,
        roster: context.selections.filter((_, at) => at !== unit.selectionIndex),
      })
      return [
        {
          pickIndex,
          models: unit.models,
          selected: { ...selected, profiles: selected.profiles.map((profile) => ({ ...profile, id: `${prefix}${profile.id}` })) },
          carriers: carriers.map((carrier) => ({
            ...carrier,
            weapons: carrier.weapons.map((weapon) => ({
              ...weapon,
              ...(weapon.profileIds ? { profileIds: weapon.profileIds.map((id) => `${prefix}${id}`) } : {}),
            })),
          })),
          rules: rosterCombatRules(loaded, rules, { ...data, pickIndex }, memberContext, selected),
        },
      ]
    })
  const selections = data.picks.map((_, index) => {
    const unit = context.unitSelections.find((candidate) => candidate.pickIndex === index)
    return unit ? context.selections[unit.selectionIndex] : undefined
  })
  const hostIndex = selectedPick.attachedTo ?? data.pickIndex
  const hostPick = data.picks[hostIndex]!
  const hostSheet = hostIndex === data.pickIndex ? sheet : companions.find((member) => member.pickIndex === hostIndex)?.selected
  const optionsFor = (replaceIndex?: number) =>
    [
      ...(hostSheet?.leaders ?? []).map((member) => ({ ...member, kind: 'leader' as const })),
      ...(hostSheet?.supporters ?? []).map((member) => ({ ...member, kind: 'support' as const })),
    ].flatMap((member) => {
      if (!member.entryId || data.picks.some((pick, index) => index !== replaceIndex && pick.entryId === member.entryId)) return []
      const candidate = {
        entryId: member.entryId,
        catalogueId: hostPick.catalogueId ?? data.catalogueId,
        attachedTo: hostIndex,
      }
      const built = buildRosterPick(
        loaded,
        data.catalogueId,
        context.selections.slice(0, context.unitSelections[0]?.selectionIndex ?? 0),
        candidate,
      )
      if (!built) return []
      const proposed =
        replaceIndex === undefined
          ? [...data.picks, candidate]
          : data.picks.map((pick, index) => (index === replaceIndex ? candidate : pick))
      const proposedSelections =
        replaceIndex === undefined
          ? [...selections, built.selection]
          : selections.map((selection, index) => (index === replaceIndex ? built.selection : selection))
      const groupIds = new Set(
        proposed.flatMap((pick, index) => (index === hostIndex || pick.attachedTo === hostIndex ? [pick.entryId] : [])),
      )
      if (attachmentErrors(proposed, loaded.index, proposedSelections).some((error) => groupIds.has(error.entryId))) return []
      return [
        {
          entryId: candidate.entryId,
          catalogueId: candidate.catalogueId,
          factionSlug: member.route?.catalogueId,
          name: member.name,
          kind: member.kind,
        },
      ]
    })
  const bodyguardOptions =
    data.picks.length === 1
      ? sheet.attachments.flatMap((member) => {
          if (!member.entryId) return []
          const candidate = { entryId: member.entryId, catalogueId: hostPick.catalogueId ?? data.catalogueId }
          const built = buildRosterPick(
            loaded,
            data.catalogueId,
            context.selections.slice(0, context.unitSelections[0]?.selectionIndex ?? 0),
            candidate,
          )
          if (
            !built ||
            attachmentErrors([candidate, { ...selectedPick, attachedTo: 0 }], loaded.index, [built.selection, selections[0]]).length
          )
            return []
          return [{ ...candidate, factionSlug: member.route?.catalogueId, name: member.name, kind: 'bodyguard' as const }]
        })
      : []
  const attachmentOptions = selectedPick.attachedTo === undefined && data.picks.length < 8 ? [...optionsFor(), ...bodyguardOptions] : []
  const attachmentReplacements = Object.fromEntries(
    members.filter((index) => data.picks[index]?.attachedTo === hostIndex).map((index) => [index, optionsFor(index)]),
  )
  return {
    selected: sheet,
    carriers: combatCarriers(context.selections[context.unitSelectionIndex]!, loaded.index, {
      primaryCatalogueId: data.catalogueId,
      roster: context.selections.filter((_, index) => index !== context.unitSelectionIndex),
    }),
    rules: rosterCombatRules(loaded, rules, data, context, sheet),
    companions,
    attachmentOptions,
    attachmentReplacements,
    attachmentErrors: [
      ...projectionErrors,
      ...attachmentErrors(data.picks, loaded.index, selections).filter((error) =>
        members.some((index) => data.picks[index]?.entryId === error.entryId),
      ),
    ],
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
  const attached = attachedUnit(data.picks, data.pickIndex!)
  const unitKeywords = [
    ...new Set([
      ...sheet.keywords,
      ...context.unitSelections.flatMap((unit) => {
        if (!attached.includes(unit.pickIndex) || data.inactivePicks?.includes(unit.pickIndex)) return []
        const pick = data.picks[unit.pickIndex]!
        return (
          datasheetAbilitiesIn(loaded, pick.catalogueId ?? data.catalogueId, pick.entryId, {
            selections: context.selections,
            unitSelectionIndex: unit.selectionIndex,
          })?.keywords ?? []
        )
      }),
    ]),
  ]
  const supportKeywords = [sheet.keywords]
  const add = (rule: CombatRule) => {
    const recipient = rule.scope === 'stratagem' ? combatRuleRecipient(rule.description) : undefined
    if (
      combatRuleIsRelevant({
        ...rule,
        models: context.unitSelections.find((unit) => unit.pickIndex === data.pickIndex)?.models,
        keywords: sheet.keywords,
      }) &&
      (combatRuleEligible(rule.description, rule.scope === 'stratagem' ? unitKeywords : sheet.keywords) ||
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
        /leading a unit|this model[’']s unit|bearer[’']s unit|(?:a model|models) in (?:this|that) unit/i.test(ability.description)
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

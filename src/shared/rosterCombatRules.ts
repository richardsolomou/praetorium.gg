import { attachmentErrors } from '../core/attach'
import { attachedUnit, attachmentHost } from '../core/attachedUnits'
import { hasTextTokens } from './sourceText'
import { parsedAbilityGrants } from './catalogueAbilityGrants'
import { type CombatRule, type CombatRuleJudge, judgedCombatRule } from '../core/combatRules'
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
import type { UnitChoiceCache } from '../core/unitChoices'
import { keywordIdsBySelection, keywordNames, type ModifierCache } from '../core/evaluate'
import { namespaceCarriers } from '../core/combatLoadouts'
import { attachedProfilePrefix } from '../core/combatScenario'
import { remember } from '../core/collections'

/**
 * What projections of one built roster can share: unit choices and modifiers are keyed by value, and each unit's
 * support abilities by its place in that roster, so share it only between projections of the same `prepared` roster.
 */
type RosterProjectionCache = {
  choiceCache: UnitChoiceCache
  modifierCache: ModifierCache
  supportSources: Map<number, ReturnType<typeof datasheetAbilitiesIn>>
}

/** The modifier cache holds catalogue data only, so a caller may share one across rosters. */
export const rosterProjectionCache = (modifierCache: ModifierCache = new WeakMap()): RosterProjectionCache => ({
  choiceCache: new WeakMap(),
  modifierCache,
  supportSources: new Map(),
})

type Projection = NonNullable<ReturnType<typeof rosterDatasheetContext>> & RosterProjectionCache

export function rosterCombatant(
  loaded: LoadedCatalogue,
  rules: LoadedRules | null,
  data: Parameters<typeof rosterDatasheetContext>[1] & { inactivePicks?: number[] },
  prepared?: Parameters<typeof rosterDatasheetContext>[2],
  {
    attachmentChoices = true,
    cache = rosterProjectionCache(),
  }: {
    /** The leaders and bodyguards that could join, which the simulator offers; a loadout search reads none of them. */
    attachmentChoices?: boolean
    cache?: RosterProjectionCache
  } = {},
) {
  data = {
    ...data,
    picks: data.picks.map((pick, index) => (data.inactivePicks?.includes(index) ? { ...pick, attachedTo: undefined } : pick)),
  }
  const projected = rosterDatasheetContext(loaded, data, prepared)
  const context: Projection | undefined = projected && {
    ...projected,
    ...cache,
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
      const prefix = attachedProfilePrefix(pickIndex)
      const carriers = combatCarriers(context.selections[unit.selectionIndex]!, loaded.index, {
        primaryCatalogueId: data.catalogueId,
        roster: context.selections.filter((_, at) => at !== unit.selectionIndex),
      })
      return [
        {
          pickIndex,
          models: unit.models,
          selected: { ...selected, profiles: selected.profiles.map((profile) => ({ ...profile, id: `${prefix}${profile.id}` })) },
          carriers: namespaceCarriers(carriers, prefix),
          rules: rosterCombatRules(loaded, rules, { ...data, pickIndex }, memberContext, selected),
        },
      ]
    })
  const selections = data.picks.map((_, index) => {
    const unit = context.unitSelections.find((candidate) => candidate.pickIndex === index)
    return unit ? context.selections[unit.selectionIndex] : undefined
  })
  const keywordIds = new Map<string, string[][]>()
  // A unit can take an attachment by a keyword the list gives it, as Bridgehead Strike makes Tempestus Scions Battleline.
  const keywords = data.picks.map((pick, index) => {
    const unit = context.unitSelections.find((candidate) => candidate.pickIndex === index)
    if (!unit) return undefined
    const catalogueId = pick.catalogueId ?? data.catalogueId
    const ids = remember(keywordIds, catalogueId, () =>
      keywordIdsBySelection(context.selections, loaded.index, { primaryCatalogueId: catalogueId, modifierCache: cache.modifierCache }),
    )
    return keywordNames(ids[unit.selectionIndex] ?? [], loaded.index)
  })
  const hostIndex = attachmentHost(data.picks, data.pickIndex)
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
      const groupIds = new Set(proposed.flatMap((pick, index) => (attachmentHost(proposed, index) === hostIndex ? [pick.entryId] : [])))
      if (attachmentErrors(proposed, loaded.index, proposedSelections, keywords).some((error) => groupIds.has(error.entryId))) return []
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
  const bodyguardOptions = () =>
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
  const attachmentOptions =
    attachmentChoices && selectedPick.attachedTo === undefined && data.picks.length < 8 ? [...optionsFor(), ...bodyguardOptions()] : []
  const attachmentReplacements = attachmentChoices
    ? Object.fromEntries(members.filter((index) => data.picks[index]?.attachedTo === hostIndex).map((index) => [index, optionsFor(index)]))
    : {}
  return {
    selected: sheet,
    models: context.unitSelections.find((unit) => unit.pickIndex === data.pickIndex)!.models,
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
      ...attachmentErrors(data.picks, loaded.index, selections, keywords).filter((error) =>
        members.some((index) => data.picks[index]?.entryId === error.entryId),
      ),
    ],
  }
}

function rosterCombatRules(
  loaded: LoadedCatalogue,
  rules: LoadedRules | null,
  data: Parameters<typeof rosterDatasheetContext>[1] & { inactivePicks?: number[] },
  context: Projection,
  sheet: Datasheet,
) {
  const selectedPick = data.picks[data.pickIndex!]!
  const modelProfiles = sheet.profiles.filter((profile) => datasheetProfileKind(profile.type) === 'unit')
  const candidates: CombatRule[] = []
  const attached = attachedUnit(data.picks, data.pickIndex!)
  const others = context.unitSelections.flatMap((unit) => {
    if (unit.pickIndex === data.pickIndex || data.inactivePicks?.includes(unit.pickIndex)) return []
    const pick = data.picks[unit.pickIndex]!
    const source = remember(context.supportSources, unit.selectionIndex, () =>
      datasheetAbilitiesIn(loaded, pick.catalogueId ?? data.catalogueId, pick.entryId, {
        selections: context.selections,
        unitSelectionIndex: unit.selectionIndex,
        choiceCache: context.choiceCache,
        modifierCache: context.modifierCache,
      }),
    )
    return [{ unit, source }]
  })
  const unitKeywords = [
    ...new Set([
      ...sheet.keywords,
      ...others.flatMap(({ unit, source }) => (attached.includes(unit.pickIndex) ? (source?.keywords ?? []) : [])),
    ]),
  ]
  const supportKeywords = [sheet.keywords]
  const models = context.unitSelections.find((unit) => unit.pickIndex === data.pickIndex)?.models
  const add = (rule: CombatRule, judge: Pick<CombatRuleJudge, 'origin' | 'attached'>) => {
    const placed: CombatRule = {
      ...rule,
      appliedDefences: (['save', 'invulnerable-save', 'toughness'] as const).filter(
        (kind) =>
          modelProfiles.length &&
          modelProfiles.every((profile) =>
            profile.values.some((value) => datasheetCharacteristicKind(value.name) === kind && value.modifiers?.includes(rule.name)),
          ),
      ),
      models,
    }
    // Every unit's keywords are known only once the roster is read; `supportKeywords` fills as it is.
    const placement: CombatRuleJudge = { ...judge, keywords: sheet.keywords, unitKeywords, supportKeywords }
    // A rule published as a token is judged where its words load (`readableRules`), against the same placement.
    if (hasTextTokens(rule.description)) candidates.push({ ...placed, keywords: sheet.keywords, judge: placement })
    else {
      const judged = judgedCombatRule(placed, placement)
      if (judged) candidates.push(judged)
    }
  }
  for (const ability of sheet.abilities) {
    if (!ability.description) continue
    add(
      {
        id: `unit:${ability.id}`,
        name: ability.name,
        source: sheet.name,
        description: ability.description,
        scope: 'unit',
        // Projection applies a Feel No Pain as a core ability, and one limited to models with a keyword to those models alone.
        included:
          (ability.kind === 'core' && /^Feel No Pain [2-6]\+$/.test(ability.name)) ||
          parsedAbilityGrants(ability.description, true, [], true).some(
            (grant) => grant.recipient === 'models' && /^Feel No Pain [2-6]\+$/.test(grant.name),
          ),
      },
      { origin: 'own', attached: selectedPick.attachedTo !== undefined },
    )
  }
  for (const { unit, source } of others) {
    if (source) supportKeywords.push(source.keywords)
    for (const ability of source?.abilities ?? []) {
      if (!ability.description || ability.kind === 'core' || ability.kind === 'faction') continue
      add(
        { id: `roster:${ability.id}`, name: ability.name, source: source!.name, description: ability.description, scope: 'nearby' },
        { origin: 'support', attached: attached.includes(unit.pickIndex) },
      )
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
      add(
        {
          id: `stratagem:${stratagem.id}`,
          name: stratagem.name,
          source: `${stratagem.cp} CP`,
          description: stratagem.description,
          scope: 'stratagem',
          phases,
        },
        { origin: 'listed' },
      )
    }
    for (const option of options) {
      for (const rule of detachmentReference(loaded, rules, data.catalogueId, routeSlug(option.name))?.rules ?? []) {
        if (rule.description)
          add(
            {
              id: `detachment:${option.id}:${rule.name}`,
              name: rule.name,
              source: option.name,
              description: rule.description,
              scope: 'detachment',
            },
            { origin: 'listed' },
          )
      }
    }
  }
  return [...new Map(candidates.map((candidate) => [candidate.id, candidate])).values()]
}

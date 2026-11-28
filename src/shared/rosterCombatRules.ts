import { attachmentErrors } from '../core/attach'
import { uniqueBy } from '../core/collections'
import { attachedUnit, attachmentHost } from '../core/attachedUnits'
import { hasTextTokens } from '../core/sourceText'
import type { TextFactsByKey } from '../core/textFacts'
import { titleCaseAbility } from './catalogueAbilityGrants'
import { abilityGrantsIn, allowancesIn, combatFactsIn, offeredOptionsOf } from './textFacts'
import { recordedCombatText } from '../core/combatReading'
import { type CombatRule, type CombatRuleJudge, combatRuleProjected, judgedCombatRule } from '../core/combatRules'
import { allowancesWhile, type BattleChoiceAllowance } from '../core/battleChoices'
import { datasheetCharacteristicKind, datasheetProfileKind } from '../core/datasheetStructure'
import { routeSlug } from '../core/slug'
import { datasheetIn, datasheetAbilitiesIn } from './catalogue'
import { combatCarriers, type CombatCarrier } from '../core/combatLoadout'
import { vsCarriersFiring } from './vsCarrierProfiles'
import type { Datasheet } from '../contracts/catalogue'
import type { LoadedCatalogue } from './catalogueIndex'
import { describeDatasheetAbilities } from './datasheetDescriptions'
import { detachmentReference } from './detachmentReference'
import { detachmentCatalogueDetail, detachmentEnhancementNames, sameRuleName } from './catalogueDescriptions'
import { buildRosterPick, rosterDatasheetContext } from './rosterDatasheetContext'
import { type LoadedRules, rulesFaction } from './rules'
import { selectedDetachmentRules } from './selectedDetachmentRules'
import { keywordIdsBySelection, keywordNames } from '../core/evaluate'
import { isWeaponProfile, loadoutSheet, namespaceCarriers } from '../core/combatLoadouts'
import { attachedProfilePrefix } from '../core/combatScenario'
import { byId, remember } from '../core/collections'
import { WEAPON_ABILITY_KINDS } from '../core/combatKeywords'
import { rulesNamed } from './catalogueRules'

/**
 * What projections of one built roster can share: each unit's support abilities by its place in that roster, so share
 * it only between projections of the same `prepared` roster.
 */
type RosterProjectionCache = { supportSources: Map<number, ReturnType<typeof datasheetAbilitiesIn>> }

export const rosterProjectionCache = (): RosterProjectionCache => ({ supportSources: new Map() })

type Projection = NonNullable<ReturnType<typeof rosterDatasheetContext>> & RosterProjectionCache

const weaponAbilityRulesByCatalogue = new WeakMap<LoadedCatalogue, ReturnType<typeof rulesNamed>>()

/**
 * One unit's combatant for its datasheet: a rule's option can give a weapon ability its weapons lack, so every weapon
 * ability's rule comes with it.
 */
export function datasheetCombatant(...[loaded, ...rest]: Parameters<typeof rosterCombatant>):
  | (NonNullable<ReturnType<typeof rosterCombatant>> & {
      weaponAbilityRules?: ReturnType<typeof rulesNamed>
      battleChoiceAllowances: BattleChoiceAllowance[]
    })
  | null {
  const combatant = rosterCombatant(loaded, ...rest)
  return (
    combatant && {
      ...combatant,
      weaponAbilityRules: remember(weaponAbilityRulesByCatalogue, loaded, () => rulesNamed(loaded, WEAPON_ABILITY_KINDS)),
      battleChoiceAllowances: battleChoiceAllowancesFor(combatant, loaded.index.textFacts),
    }
  )
}

/**
 * What a combatant's abilities and enhancements, and those of the units leading it, allow the battle choices of its rules,
 * as a second Order, each matched to the rules it widens by name: read from the facts recorded for their tokens, so a
 * device holding no words answers as the server does.
 */
function battleChoiceAllowancesFor(
  combatant: { selected: Datasheet; rules: CombatRule[]; companions: { selected: Datasheet }[] },
  facts: TextFactsByKey | undefined,
): BattleChoiceAllowance[] {
  const stated = [combatant.selected, ...combatant.companions.map((member) => member.selected)].flatMap((sheet) =>
    [...sheet.abilities, ...(sheet.enhancements ?? [])].flatMap(({ description }) => (description ? allowancesIn(description, facts) : [])),
  )
  const offered = combatant.rules.map((rule) => ({
    name: rule.name,
    options: offeredOptionsOf(rule.description, facts).map((options) => options.toLowerCase()),
  }))
  return allowancesWhile(stated, combatant.companions.length > 0).map((allowance) => ({
    ...allowance,
    rules: offered.filter((rule) => rule.options.includes(allowance.options.toLowerCase())).map((rule) => rule.name),
  }))
}

/**
 * A VS pick's datasheet and carriers as the simulator fields them: its catalogue tree is built at the default loadout, so
 * each carried weapon names the profiles it fires and the datasheet counts each weapon from the carriers VS Data fields.
 */
function vsFielding(
  loaded: LoadedCatalogue,
  catalogueId: string,
  entryId: string,
  sheet: Datasheet | null,
  carriers: CombatCarrier[] | undefined,
  catalogue: () => CombatCarrier[],
) {
  if (!sheet || !carriers) return { sheet, carriers }
  const weapons = (datasheetIn(loaded, catalogueId, entryId)?.profiles ?? []).filter(isWeaponProfile)
  const firing = vsCarriersFiring(carriers, [...sheet.profiles.filter(isWeaponProfile), ...weapons], catalogue())
  return { sheet: loadoutSheet(sheet, weapons, firing), carriers: firing }
}

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
  const selectedUnit = context.unitSelections.find((unit) => unit.pickIndex === data.pickIndex)
  const catalogueCarriers = (selectionIndex: number) =>
    combatCarriers(context.selections[selectionIndex]!, loaded.index, {
      primaryCatalogueId: data.catalogueId,
      roster: context.selections.filter((_, at) => at !== selectionIndex),
    })
  const fielded = vsFielding(
    loaded,
    data.catalogueId,
    selectedPick.entryId,
    datasheetIn(loaded, data.catalogueId, selectedPick.entryId, context),
    selectedUnit?.carriers,
    () => catalogueCarriers(context.unitSelectionIndex),
  )
  const sheet = describeDatasheetAbilities(loaded, selectedPick.catalogueId ?? data.catalogueId, fielded.sheet, rules)
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
      const member = vsFielding(
        loaded,
        data.catalogueId,
        pick.entryId,
        datasheetIn(loaded, data.catalogueId, pick.entryId, memberContext),
        unit.carriers,
        () => catalogueCarriers(unit.selectionIndex),
      )
      const selected = describeDatasheetAbilities(loaded, pick.catalogueId ?? data.catalogueId, member.sheet, rules)
      if (!selected) return unavailable()
      const prefix = attachedProfilePrefix(pickIndex)
      const carriers = member.carriers ?? catalogueCarriers(unit.selectionIndex)
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
      keywordIdsBySelection(context.selections, loaded.index, { primaryCatalogueId: catalogueId }),
    )
    return keywordNames(ids[unit.selectionIndex] ?? [], loaded.index)
  })
  const hostIndex = attachmentHost(data.picks, data.pickIndex)
  const hostPick = data.picks[hostIndex]!
  const hostSheet = hostIndex === data.pickIndex ? sheet : companions.find((member) => member.pickIndex === hostIndex)?.selected
  // A character the army decides the role of, as Cato Sicarius leading or supporting, is offered once; its role is the list's.
  const optionsFor = (replaceIndex?: number) =>
    uniqueBy(
      [
        ...(hostSheet?.leaders ?? []).map((member) => ({ ...member, kind: 'leader' as const })),
        ...(hostSheet?.supporters ?? []).map((member) => ({ ...member, kind: 'support' as const })),
      ],
      (member) => member.entryId ?? member.name,
    ).flatMap((member) => {
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
      if (
        attachmentErrors(proposed, loaded.index, proposedSelections, keywords, data.detachmentIds).some((error) =>
          groupIds.has(error.entryId),
        )
      )
        return []
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
      ? uniqueBy(sheet.attachments, (member) => member.entryId ?? member.name).flatMap((member) => {
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
            attachmentErrors(
              [candidate, { ...selectedPick, attachedTo: 0 }],
              loaded.index,
              [built.selection, selections[0]],
              [],
              data.detachmentIds,
            ).length
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
    models: selectedUnit!.models,
    /** The size the pick asked for that its rules do not field, when they moved it. */
    refusedModels: selectedUnit!.refusedModels,
    carriers: fielded.carriers ?? catalogueCarriers(context.unitSelectionIndex),
    rules: rosterCombatRules(loaded, rules, data, context, sheet),
    companions,
    attachmentOptions,
    attachmentReplacements,
    attachmentErrors: [
      ...projectionErrors,
      ...attachmentErrors(data.picks, loaded.index, selections, keywords, data.detachmentIds).filter((error) =>
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
  const recordedCombat = (description: string, holder?: string) => combatFactsIn(description, loaded.index.textFacts, holder)
  /** `holder` is the datasheet rule or profile the description is, which identical words on another datasheet may not read alike. */
  const add = (rule: CombatRule, judge: Pick<CombatRuleJudge, 'origin' | 'attached'>, holder?: string) => {
    const placed: CombatRule = {
      ...rule,
      appliedDefences: (['save', 'invulnerable-save', 'toughness'] as const).filter(
        (kind) =>
          modelProfiles.length &&
          modelProfiles.every((profile) =>
            profile.values.some((value) => datasheetCharacteristicKind(value.name) === kind && combatRuleProjected(rule, value.modifiers)),
          ),
      ),
      models,
      ...(sheet.modelKeywords?.length ? { partialKeywords: sheet.modelKeywords.flatMap((group) => group.keywords) } : {}),
    }
    // Every unit's keywords are known only once the roster is read; `supportKeywords` fills as it is.
    const placement: CombatRuleJudge = { ...judge, keywords: sheet.keywords, unitKeywords, supportKeywords }
    const recorded = recordedCombat(rule.description, holder)
    // A token without combat facts does something unknown, which the simulator lists as not calculated.
    if (recorded === undefined && hasTextTokens(rule.description)) {
      candidates.push({ ...placed, keywords: sheet.keywords })
      return
    }
    const judged = judgedCombatRule(placed, placement, recorded === undefined ? undefined : recordedCombatText(recorded))
    if (judged) candidates.push(judged)
  }
  for (const ability of [...sheet.abilities, ...(sheet.enhancements ?? [])]) {
    if (!ability.description) continue
    add(
      {
        id: `unit:${ability.id}`,
        name: ability.name,
        source: sheet.name,
        description: ability.description,
        scope: 'unit',
        ...(ability.kind === 'upgrade' && ability.source ? { appliedAs: [ability.source] } : {}),
        ...(ability.kind === 'wargear' ? { heldBy: ability.id } : {}),
        // Projection applies a Feel No Pain as a core ability, and one limited to models with a keyword, or to the leader, to those models alone.
        included:
          (ability.kind === 'core' && /^Feel No Pain [2-6]\+$/.test(ability.name)) ||
          abilityGrantsIn(ability.description, loaded.index.textFacts).grants.some(
            (grant) =>
              !('condition' in grant && grant.condition) &&
              /^Feel No Pain [2-6]\+$/i.test(
                grant.recipient === 'models' ? grant.name : grant.recipient === 'leader' ? titleCaseAbility(grant.written) : '',
              ),
          ),
      },
      { origin: 'own', attached: selectedPick.attachedTo !== undefined },
      ability.id,
    )
  }
  for (const { unit, source } of others) {
    if (source) supportKeywords.push(source.keywords)
    for (const ability of [...(source?.abilities ?? []), ...(source?.enhancements ?? [])]) {
      if (!ability.description || ability.kind === 'core' || ability.kind === 'faction') continue
      add(
        {
          id: `roster:${ability.id}`,
          name: ability.name,
          source: source!.name,
          description: ability.description,
          scope: 'nearby',
          ...(ability.kind === 'upgrade' && ability.source ? { appliedAs: [ability.source] } : {}),
        },
        { origin: 'support', attached: attached.includes(unit.pickIndex) },
        ability.id,
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
    const army = rules.factionRules.get(factionKey)
    if (army)
      add(
        { id: `army:${routeSlug(army.name)}`, name: army.name, source: 'Army rule', description: army.description, scope: 'unit' },
        { origin: 'army' },
      )
    for (const stratagem of [...selected.written, ...core]) {
      if (!stratagem.description) continue
      // A Command-phase stratagem's effect can last through the Shooting and Fight phases that follow it.
      const either = !stratagem.phases.length || stratagem.phases.includes('command')
      const phases: CombatRule['phases'] = []
      if (either || stratagem.phases.includes('shooting')) phases.push('ranged')
      // A Charge-phase effect, such as mortal wounds on ending a charge move, lands before the Fight phase that follows.
      if (either || stratagem.phases.includes('fight') || stratagem.phases.includes('charge')) phases.push('melee')
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
      // A card's words are withheld as tokens; where a rules version records nothing for them, the catalogue's own copy of
      // the same rule, where it has one, records what they decide.
      let copies: NonNullable<ReturnType<typeof detachmentCatalogueDetail>>['rules'] | undefined
      const catalogued = () => (copies ??= detachmentCatalogueDetail(loaded, data.catalogueId, option.id, [])?.rules ?? [])
      for (const rule of detachmentReference(loaded, rules, data.catalogueId, routeSlug(option.name))?.rules ?? []) {
        const unrecorded = rule.description && hasTextTokens(rule.description) && recordedCombat(rule.description) === undefined
        const judgeable = unrecorded
          ? catalogued().find(
              (candidate) =>
                sameRuleName(candidate.name, rule.name) &&
                candidate.description &&
                (!hasTextTokens(candidate.description) || recordedCombat(candidate.description) !== undefined),
            )?.description
          : undefined
        const description = judgeable ?? rule.description
        if (description)
          add(
            {
              id: `detachment:${option.id}:${rule.name}`,
              name: rule.name,
              source: option.name,
              description,
              scope: 'detachment',
              // The catalogue projects a detachment rule's always-on part under the detachment's name, or under the enhancement that brings a model into it.
              appliedAs: [option.name, ...detachmentEnhancementNames(loaded, option.name)],
            },
            { origin: 'listed' },
          )
      }
    }
  }
  return [...byId(candidates).values()]
}

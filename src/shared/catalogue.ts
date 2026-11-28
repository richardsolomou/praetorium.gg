import type { PickedGrant } from '../core/textFacts'
import { datasheetCharacteristicKind, isWrittenInvulnerableSave } from '../core/datasheetStructure'
import { abilityKey } from './vsDataAbilities'
import { withoutFactionPrefix } from '../core/name'
import { canonicalDetachmentName } from '../core/detachmentName'
import { cachedIn, remember, uniqueBy } from '../core/collections'
import {
  type Definition,
  definitionAndTarget,
  isAbilityProfile,
  profileDescription,
  type InfoGroup,
  type InfoLink,
  linkedProfile,
  nameOf,
  type Profile,
  targetOf,
} from '../core/catalogue'
import { comparableText, withoutText } from '../core/sourceText'
import { attachmentRoles, referenceAttachmentOf } from '../core/attach'
import { type PrintedTransport, withPrintedWargear } from '../core/transport'
import {
  flattenedModifiers,
  infoLinkHiddenByRules,
  keywordIds,
  keywordIdsBySelection,
  profileModifiers,
  type ProfileModifier,
  type Selection,
  unitKeywordIds,
} from '../core/evaluate'
import { defaultSelection } from '../core/expand'
import { unitChoices } from '../core/unitChoices'
import { wargearOf } from '../core/wargear'
import { wargearKey } from '../core/wargearNames'
import { carrierModelProfiles, type CombatCarrier, combatCarriers, referenceOnlyWeapon } from '../core/combatLoadout'
import type { ModelLine } from '../core/battle'
import { modelLineDrafts, unitHeldWargearIn } from '../core/modelLines'
import { readText, type TextFactsByKey } from '../core/textFacts'
import { MODEL_LINES_MAX } from '../core/commands'
import { ruleReferenceMatches, splitWeaponKeywords } from '../core/ruleReference'
import { routeSlug } from '../core/slug'
import { matchesKeywordSelector, normalizeKeywordSelector } from '../core/keywords'
import { datasheetIdBySlug, datasheetSlug, datasheetsOf, referenceDatasheetRoute, type LoadedCatalogue } from './catalogueIndex'
import { type DatasheetSearchFields, dedupeWeapons } from '../core/datasheetSearch'
import { listPriceOf } from './catalogueUnit'
import { datacardOf } from './datasheetJoin'
import { mergeDetachmentRules } from './catalogueDescriptions'
import { definitionTokens, displayRuleName, isConditionalModifier, modifiedProfileField } from './catalogueDisplay'
import { relationshipFor, relationshipsFor } from './catalogueRelationships'
import { deploymentAbilities, parseAbilityGrants, parsedAbilityGrants } from './catalogueAbilityGrants'
import {
  abilityGrantsIn,
  bareValueOf,
  invulnerableSaveOf,
  ledWeaponGrantOf,
  normalizedAbilityGrantsIn,
  pickedGrantsOf,
  ownWeaponGrantOf,
  weaponGrantsIn,
} from './textFacts'
import type { AbilityKind, Datasheet } from '../contracts/catalogue'
import { baseSizeOf } from './vsDataBaseSizes'
import { type VsStatValues, vsStatLinesOf } from './vsDataProfiles'
import { vsDefinitionsOf, vsUnitIdOf } from './vsDataBuild'
import { compositionLines } from './vsDataUnitLines'
import { rulesNamed } from './catalogueRules'

export function toughnessOf(profiles: readonly { type: string; values: readonly { name: string; value: string }[] }[]): number | null {
  const values = profiles
    .filter((profile) => profile.type.toLowerCase() === 'unit')
    .flatMap((profile) => profile.values)
    .filter((value) => ['t', 'toughness'].includes(value.name.trim().toLowerCase()))
    .map((value) => Number.parseInt(value.value, 10))
    .filter(Number.isFinite)
  return values.length ? Math.max(...values) : null
}

/**
 * What one model of a datasheet can take, where every model of it takes the same.
 *
 * Null where the profiles disagree, which is a squad built from a sergeant and his
 * veterans: a unit is tracked as one row, so there is no honest single answer and
 * naming one would be wrong for most of the models in it. Null too where nothing
 * states a wounds characteristic at all, and the two are the same answer to whoever
 * is asking — the unit is counted in models instead.
 */
export function woundsOf(profiles: readonly { type: string; values: readonly { name: string; value: string }[] }[]): number | null {
  const values = new Set(
    profiles
      .filter((profile) => profile.type.toLowerCase() === 'unit')
      .flatMap((profile) => profile.values)
      .filter((value) => ['w', 'wounds'].includes(value.name.trim().toLowerCase()))
      .map((value) => Number.parseInt(value.value, 10))
      .filter((value) => Number.isFinite(value) && value > 0),
  )
  return values.size === 1 ? [...values][0]! : null
}

/** The wargear a datasheet's options say the unit has rather than a model, by `wargearKey`. */
function unitHeldWargear(sheet: Datasheet | null, facts: TextFactsByKey | undefined) {
  const named = (sheet?.wargearOptions ?? []).flatMap((option) =>
    readText(option, facts, unitHeldWargearIn, (recorded) => recorded.unitHeldWargear ?? []),
  )
  return new Set(named.map((name) => wargearKey(name)))
}

/**
 * A unit's models by what they are and carry, which a battle names its casualties by.
 *
 * Nothing for a unit of one kind, and nothing where the lines would not add up to the
 * unit, since a line the player cannot match to a model on the table is worse than
 * counting the unit as a whole. A line's wounds are named only where the unit has
 * no single number for them, such as a Nob among Boyz.
 */
export function modelLinesOf(
  carriers: readonly CombatCarrier[],
  wargear: readonly { name: string; count: number }[],
  models: number,
  sheet: Datasheet | null,
  facts?: TextFactsByKey,
): ModelLine[] | undefined {
  const lines = modelLineDrafts(carriers, wargear, unitHeldWargear(sheet, facts))
  if (lines.length < 2 || lines.length > MODEL_LINES_MAX || lines.reduce((total, line) => total + line.models, 0) !== models)
    return undefined
  const profiles = sheet?.profiles.filter((profile) => profile.type.toLowerCase() === 'unit') ?? []
  const mixed = woundsOf(profiles) === null
  return lines.map(({ carriers: [first], ...line }) => {
    const wounds = mixed ? woundsOf(carrierModelProfiles(carriers[first!]!, profiles).map((at) => profiles[at]!)) : null
    return { ...line, ...(wounds === null ? {} : { wounds }) }
  })
}

export function unitBattleDetailsIn(loaded: LoadedCatalogue, catalogueId: string, entryIds: readonly string[]) {
  return [...new Set(entryIds)].flatMap((entryId) => {
    const ownerId = loaded.index.catalogueOf.get(entryId) ?? catalogueId
    // A library unit fielded by an army resolves through that army's catalogue when not through its own.
    const sheet = datasheetIn(loaded, ownerId, entryId) ?? datasheetIn(loaded, catalogueId, entryId)
    if (!sheet) return []
    const wounds = woundsOf(sheet.profiles)
    return [
      {
        entryId,
        ...(wounds === null ? {} : { wounds }),
        ...(sheet.transport ? { transportRule: sheet.transport } : {}),
        ...(sheet.transportCapacity ? { transportCapacity: sheet.transportCapacity } : {}),
      },
    ]
  })
}

type DatasheetContext = {
  selections: readonly Selection[]
  unitSelectionIndex?: number
  /** Whether to keep weapons the unit is not carrying. */
  everyWeapon?: boolean
  everyWargearAbility?: boolean
  /** The units that count as this one, by position: a character and what it leads. */
  companions?: readonly number[]
  keywordIds?: readonly string[]
  rosterKeywordIds?: readonly (readonly string[])[]
  /** Shared by paired projections of the same roster and unit. */
  modifiers?: readonly ProfileModifier[]
}

type Walked = NonNullable<ReturnType<typeof walk>>

const walkCache = new WeakMap<LoadedCatalogue, Map<string, Walked | null>>()
const sheetCache = new WeakMap<LoadedCatalogue, Map<string, Datasheet | null>>()

/**
 * What a datasheet is on its own, read once per snapshot.
 *
 * The reference page, the picker, the search index and the pricing of a roster all
 * ask about the datasheet before any list has touched it, so the walk is made once
 * against the default selection and kept for as long as the snapshot is; a roster's
 * own view is walked on demand by the same code with the list as context. The full sheet — price, card, relationships
 * — is dearer than the walk and is kept only once something has asked for it.
 */
const walkRecord = (loaded: LoadedCatalogue, catalogueId: string, entryId: string) =>
  cachedIn(walkCache, loaded, `${catalogueId}:${entryId}`, () => walk(loaded, catalogueId, entryId))

/**
 * The names of the abilities a unit holds in its list: its datasheet's own, linked rules and ability profiles alike,
 * unless `ownRules` is false, which keeps only the rules it links because of the list, and those its other selections'
 * profiles and the units leading it give it.
 */
export function contextualAbilityNamesIn(
  loaded: LoadedCatalogue,
  catalogueId: string,
  entryId: string,
  context: Pick<DatasheetContext, 'selections' | 'unitSelectionIndex' | 'companions' | 'keywordIds' | 'rosterKeywordIds'>,
  { ownRules = true } = {},
): string[] {
  const root = loaded.index.definitions.get(entryId)
  if (!root) return []
  const selected =
    context.unitSelectionIndex === undefined
      ? defaultSelection(entryId, loaded.index, { primaryCatalogueId: catalogueId })
      : context.selections[context.unitSelectionIndex]
  const definitions = selected ? definitionsInSelections([selected], [0], loaded.index) : []
  const intrinsic = definitionAndTarget(root, loaded.index)
  const linkedIn = (selections: readonly Selection[]) =>
    intrinsic.flatMap((definition) => linkedAbilityNames(definition, loaded.index, catalogueId, selections))
  const linked = linkedIn(context.selections)
  // Without its own rules, a datasheet still holds a rule it links only in this list, as a Detachment switches one on.
  const bare = ownRules ? [] : linkedIn(selected ? [selected] : [])
  return [
    ...new Set([
      ...(ownRules ? linked : linked.filter((name) => !bare.includes(name))),
      ...definitions
        .filter((definition) => ownRules || !intrinsic.some((own) => own.id === definition.id))
        .flatMap((definition) =>
          definitionAndTarget(definition, loaded.index).flatMap((source) =>
            abilityProfileNames(source, loaded.index, root.absentAbilities),
          ),
        ),
      ...grantedAbilitiesInAttachedUnit(
        context.selections,
        context.unitSelectionIndex,
        context.companions ?? [],
        loaded.index,
        catalogueId,
        context.keywordIds,
        context.rosterKeywordIds,
      ).map((ability) => ability.name),
    ]),
  ]
}

/**
 * The pre-battle picks a unit offers its army through its own abilities, wargear and Enhancements, each with the rule
 * that offers it, as Thunderhawk Insertion's Deep Strike for one GRAVIS, PHOBOS or TACTICUS unit.
 */
export function offeredPicksIn(
  loaded: LoadedCatalogue,
  catalogueId: string,
  entryId: string,
  context: Pick<DatasheetContext, 'selections' | 'unitSelectionIndex'>,
): { rule: string; grant: PickedGrant }[] {
  const root = loaded.index.definitions.get(entryId)
  if (!root) return []
  const selected =
    context.unitSelectionIndex === undefined
      ? defaultSelection(entryId, loaded.index, { primaryCatalogueId: catalogueId })
      : context.selections[context.unitSelectionIndex]
  const definitions = [root, ...(selected ? definitionsInSelections([selected], [0], loaded.index) : [])]
  const found = new Map<string, { rule: string; grant: PickedGrant }>()
  for (const definition of definitions)
    for (const source of definitionAndTarget(definition, loaded.index))
      for (const profile of abilityProfilesOf(source, loaded.index, root.absentAbilities)) {
        const description = profileDescription(profile)
        for (const grant of description ? pickedGrantsOf(description, loaded.index.textFacts) : [])
          found.set(JSON.stringify([profile.name, grant]), { rule: profile.name, grant })
      }
  return [...found.values()]
}

function abilityProfileNames(definition: Definition, index: LoadedCatalogue['index'], absent: AbsentAbilities): string[] {
  const names = new Set<string>()
  for (const profile of abilityProfilesOf(definition, index, absent)) {
    const name = profile.name
    const description = profileDescription(profile)
    if (deploymentAbilities(name).length && description?.trim()) {
      const parsed = parseAbilityGrants(normalizedAbilityGrantsIn(description, index.textFacts), false, [name], true)
      if (parsed.matched && !parsed.grants.some((grant) => ruleReferenceMatches(grant.name, name))) continue
    }
    names.add(name)
  }
  return [...names]
}

type AbsentAbilities = Definition['absentAbilities']

/**
 * Whether the rules version marks this ability absent from the datasheet, by a profile id along the way to it or by its
 * `abilityKey`, which leaves it out of everything read from that datasheet's abilities.
 */
function markedAbsent(absent: AbsentAbilities, profile: Profile, lineage: readonly string[]) {
  return Boolean(
    absent && profile.name && (absent.profiles.some((id) => lineage.includes(id)) || absent.keys.includes(abilityKey(profile.name))),
  )
}

/** What the rules version marks absent from the datasheets the selections at these indexes are. */
function absentIn(selections: readonly Selection[], indexes: readonly number[], index: LoadedCatalogue['index']): AbsentAbilities {
  const marks = indexes.flatMap((at) => {
    const selection = selections[at]
    const absent = selection ? index.definitions.get(selection.id)?.absentAbilities : undefined
    return absent ? [absent] : []
  })
  return marks.length ? { profiles: marks.flatMap((mark) => mark.profiles), keys: marks.flatMap((mark) => mark.keys) } : undefined
}

/**
 * A definition's visible ability profiles: its own, its info groups', and those it links from the shared library, but
 * for those the rules version marks absent from its datasheet.
 */
function abilityProfilesOf(
  definition: Definition,
  index: LoadedCatalogue['index'],
  absent: AbsentAbilities,
): (Profile & { name: string })[] {
  const found: (Profile & { name: string })[] = []
  const add = (profile: Profile, lineage: readonly string[] = []) => {
    if (isAbilityProfile(profile) && profile.name && !profile.hidden && !markedAbsent(absent, profile, [...lineage, profile.id]))
      found.push({ ...profile, name: profile.name })
  }
  definition.profiles?.forEach((profile) => add(profile))
  for (const group of definition.infoGroups ?? []) {
    if (!group.hidden) group.profiles?.forEach((profile) => add(profile))
  }
  for (const link of definition.infoLinks ?? []) {
    if (link.hidden || link.type === 'rule') continue
    const shared = index.shared.get(link.targetId)
    if (!shared) continue
    if ('profiles' in shared) {
      if (!shared.hidden) shared.profiles?.forEach((profile) => add(profile, [link.id]))
    } else add({ ...shared, name: link.name ?? shared.name }, [link.id])
  }
  return found
}

/** Ability names alone: roster pricing only needs to recognise deployment abilities. */
export const abilityNamesIn = (loaded: LoadedCatalogue, catalogueId: string, entryId: string): string[] => [
  ...new Set(walkRecord(loaded, catalogueId, entryId)?.abilities.map((ability) => ability.name) ?? []),
]

/**
 * What a datasheet is found by, and with `effects` what its abilities say, for a search answered where it
 * runs: those fields never leave it. The server reads its tokens back into words; a device holds none to read.
 */
export function datasheetSearchFieldsIn(
  loaded: LoadedCatalogue,
  catalogueId: string,
  entryId: string,
  effects = false,
): DatasheetSearchFields | null {
  const walked = walkRecord(loaded, catalogueId, entryId)
  if (!walked) return null
  const weapons = walked.profiles.filter((profile) => profile.type === 'Ranged Weapons' || profile.type === 'Melee Weapons')
  const words = effects ? (loaded.definitions?.words ?? ((text: string) => text)) : undefined
  return {
    name: walked.name,
    keywords: walked.keywords,
    abilities: [...new Set(walked.abilities.filter((ability) => ability.kind !== 'rule').map((ability) => ability.name))],
    ...(words
      ? {
          abilityDescriptions: walked.abilities.flatMap((ability) =>
            (ability.kind === 'datasheet' || ability.kind === 'wargear' || ability.kind === 'upgrade') && ability.description
              ? [{ name: ability.name, description: withoutText(words(ability.description)) }]
              : [],
          ),
        }
      : {}),
    weapons: dedupeWeapons(weapons.map((weapon) => weapon.name)),
    weaponKeywords: [
      ...new Set(
        weapons.flatMap((weapon) => weapon.values.flatMap((value) => (value.name === 'Keywords' ? splitWeaponKeywords(value.value) : []))),
      ),
    ],
    wargear: [...new Set(walked.choices.flatMap((choice) => [choice.name, ...choice.options.map((option) => option.name)]))],
  }
}

/**
 * Structured display data for one top-level datasheet, including linked shared
 * profiles: the kept sheet on its own, or a projection with the list as context.
 */
export function datasheetIn(loaded: LoadedCatalogue, catalogueId: string, entryId: string, context?: DatasheetContext): Datasheet | null {
  if (context) return assemble(loaded, catalogueId, entryId, walk(loaded, catalogueId, entryId, context))
  return cachedIn(sheetCache, loaded, `${catalogueId}:${entryId}`, () =>
    assemble(loaded, catalogueId, entryId, walkRecord(loaded, catalogueId, entryId)),
  )
}

/** Support effects need selected abilities, without weapon stats or reference relationships. */
export function datasheetAbilitiesIn(loaded: LoadedCatalogue, catalogueId: string, entryId: string, context: DatasheetContext) {
  const walked = walk(loaded, catalogueId, entryId, context, true)
  return walked ? { name: walked.name, abilities: walked.abilities, enhancements: walked.enhancements, keywords: walked.keywords } : null
}

/** What the datasheet's transport carries: VS Data's typed capacity, or failing that what its printed rule reads as. */
function transportCapacityOf(loaded: LoadedCatalogue, entryId: string, details: { transportCapacity?: PrintedTransport } | null) {
  const vsData = loaded.vsProfiles?.transports?.[entryId]
  const capacity = vsData ? withPrintedWargear(vsData, details?.transportCapacity) : details?.transportCapacity
  return capacity ? { transportCapacity: capacity } : {}
}

/** The datasheet's model counts as its VS Data unit fields them, or null where VS Data does not define it. */
export function vsCompositionOf(loaded: LoadedCatalogue, catalogueId: string, entryId: string) {
  const definitions = vsDefinitionsOf(loaded)
  const unitId = vsUnitIdOf(loaded, catalogueId, entryId)
  const unit = unitId ? definitions?.get('unit', unitId) : undefined
  if (!definitions || !unit) return null
  const name = (id: string) => definitions.get('model', id)?.name ?? id
  return compositionLines({
    sizes: unit.data.sizes,
    models: definitions.modelsOf(unit.id).map((model) => ({ name: model.name, min: model.data.min, max: model.data.max })),
    ...(unit.data.defaultModels
      ? { defaultModels: Object.entries(unit.data.defaultModels).map(([id, count]) => [name(id), count] as [string, number]) }
      : {}),
  })
}

function assemble(loaded: LoadedCatalogue, catalogueId: string, entryId: string, walked: Walked | null): Datasheet | null {
  if (!walked) return null
  const { root, name, catalogueOptions } = walked
  const details = datacardOf(loaded, catalogueId, entryId)?.details ?? null
  const attachment = referenceAttachmentOf(root, loaded.index)
  const relationships = relationshipsFor(loaded, catalogueId, root.id, name)
  return {
    id: root.id,
    slug: datasheetSlug(loaded, catalogueId, root.id),
    referenceRoute: referenceDatasheetRoute(loaded, name, { catalogueId, entryId }),
    name,
    points: listPriceOf(loaded, catalogueId, entryId),
    keywords: walked.keywords,
    ...(walked.modelKeywords.length ? { modelKeywords: walked.modelKeywords } : {}),
    profiles: walked.profiles,
    abilities: walked.abilities,
    ...(walked.enhancements.length ? { enhancements: walked.enhancements } : {}),
    composition: vsCompositionOf(loaded, catalogueId, entryId) ?? details?.composition ?? [],
    ...(details?.modelCount ? { modelCount: details.modelCount } : {}),
    loadout: details?.loadout ?? null,
    wargearOptions: details?.wargear.length
      ? details.wargear
      : catalogueOptions.map(({ name: optionName, options }) => `**${optionName}:** ${options}.`),
    ...(details?.wargearGroups?.length ? { wargearGroups: details.wargearGroups } : {}),
    baseSize: baseSizeOf(loaded, entryId),
    transport: details?.transport ?? null,
    ...transportCapacityOf(loaded, entryId, details),
    costs: details?.points ?? [],
    attachments: attachment
      ? attachmentRoles(attachment).flatMap((kind) =>
          attachment.targets.map((target) => relationshipFor(loaded, catalogueId, target, kind)),
        )
      : [],
    leaders: relationships.leaders.map((leader) => relationshipFor(loaded, catalogueId, leader.name, undefined, leader.entryId)),
    supporters: relationships.supporters.map((supporter) =>
      relationshipFor(loaded, catalogueId, supporter.name, undefined, supporter.entryId),
    ),
    keywordRules: walked.keywordRules,
  }
}

/** The catalogue's own answer for a datasheet: what it prints and offers, as a list would see it. */
function walk(loaded: LoadedCatalogue, catalogueId: string, entryId: string, context?: DatasheetContext, abilitiesOnly = false) {
  if (!datasheetsOf(loaded.index, catalogueId).has(entryId)) return null
  const root = loaded.index.definitions.get(entryId)
  if (!root) return null

  const modifiers =
    context?.modifiers ??
    (context
      ? profileModifiers(
          context.selections,
          entryId,
          loaded.index,
          { primaryCatalogueId: catalogueId },
          context.unitSelectionIndex,
          context.companions ?? [],
        )
      : [])
  const grantedWeaponAbilities =
    context && !abilitiesOnly
      ? [
          ...weaponAbilitiesFromDetachments(context.selections, context.unitSelectionIndex, loaded, catalogueId, context.keywordIds),
          ...weaponAbilitiesInSelectedUnit(context.selections, context.unitSelectionIndex, loaded.index),
          ...weaponAbilitiesInAttachedUnit(context.selections, context.unitSelectionIndex, context.companions ?? [], loaded.index),
        ]
      : []
  // A datasheet read alone shows the save its own abilities give each model, as a roster fielding it would.
  const grantedInvulnerableSaves = abilitiesOnly
    ? []
    : context
      ? invulnerableSavesInSelectedUnit(context.selections, context.unitSelectionIndex, loaded.index)
      : invulnerableSavesOnDatasheet(root, loaded.index)
  const grantedAbilities = context
    ? grantedAbilitiesInAttachedUnit(
        context.selections,
        context.unitSelectionIndex,
        context.companions ?? [],
        loaded.index,
        catalogueId,
        context.keywordIds,
      )
    : []
  const selected = new Set<string>()
  const selectedCounts = new Map<string, number>()
  const requestedUnit = context?.unitSelectionIndex === undefined ? undefined : context.selections[context.unitSelectionIndex]
  const matchesUnit = (selection: Selection) => {
    if (selection.id === root.id || selection.id === entryId) return true
    const definition = loaded.index.definitions.get(selection.id)
    return Boolean(definition && targetOf(definition, loaded.index.definitions).id === targetOf(root, loaded.index.definitions).id)
  }
  const selectedUnit = requestedUnit ? (matchesUnit(requestedUnit) ? requestedUnit : context?.selections.find(matchesUnit)) : undefined
  const collectSelected = (selection: Selection) => {
    if ((selection.count ?? 1) <= 0) return
    selected.add(selection.id)
    selectedCounts.set(selection.id, Math.max(selectedCounts.get(selection.id) ?? 0, selection.count ?? 1))
    const definition = loaded.index.definitions.get(selection.id)
    if (definition) {
      const target = targetOf(definition, loaded.index.definitions)
      selected.add(target.id)
      selectedCounts.set(target.id, Math.max(selectedCounts.get(target.id) ?? 0, selection.count ?? 1))
    }
    selection.selections?.forEach(collectSelected)
  }
  if (selectedUnit) collectSelected(selectedUnit)
  const wargearCounts = new Map<string, number>()
  for (const { name, count } of selectedUnit ? wargearOf(selectedUnit, loaded.index) : []) {
    const key = wargearKey(name)
    wargearCounts.set(key, (wargearCounts.get(key) ?? 0) + count)
  }
  const equippedCounts = new Map<string, number>()
  for (const carrier of selectedUnit
    ? combatCarriers(selectedUnit, loaded.index, {
        primaryCatalogueId: catalogueId,
        roster: context?.selections.filter((entry) => entry !== selectedUnit),
      })
    : []) {
    for (const weapon of carrier.weapons) {
      for (const id of weapon.profileIds ?? []) equippedCounts.set(id, (equippedCounts.get(id) ?? 0) + weapon.count)
    }
  }
  const profiles = new Map<string, { profile: Profile; lineage: string[]; owner: string[] }>()
  const abilities = new Map<string, Datasheet['abilities'][number]>()
  const enhancements = new Map<string, Datasheet['abilities'][number]>()
  const keywordRules = new Map<string, Datasheet['keywordRules'][number]>()
  const visited = new Set<string>()
  const addProfile = (profile: Profile, kind: AbilityKind, lineage: string[], owner: string[], source?: string, into = abilities) => {
    if (isAbilityProfile(profile) && profile.name) {
      const profileLineage = [...lineage, profile.id]
      if (markedAbsent(root.absentAbilities, profile, profileLineage)) return
      const hidden = modifiedProfileField(
        String(profile.hidden ?? false),
        'hidden',
        profile.typeName,
        profileLineage,
        owner,
        modifiers,
      ).value
      if (hidden === 'true') return
      into.set(`${kind}:${profile.id}`, { id: profile.id, name: profile.name, source, description: profileDescription(profile), kind })
    } else if (!abilitiesOnly) {
      profiles.set(profile.id, { profile, lineage, owner })
    }
  }
  const addRule = (link: InfoLink, kind: AbilityKind) => {
    if (link.type !== 'rule' || infoLinkHiddenByRules(link, loaded.index, { primaryCatalogueId: catalogueId, roster: context?.selections }))
      return
    const rule = loaded.index.rules.get(link.targetId)
    const name = displayRuleName(link, link.name ?? rule?.name)
    const owner = loaded.index.ruleCatalogueOf.get(link.targetId)
    const ruleKind = owner && loaded.index.catalogues.get(owner)?.gameSystem ? 'core' : kind
    if (name && !rule?.hidden)
      abilities.set(`${ruleKind}:${link.id}`, { id: link.id, name, description: rule?.description ?? null, kind: ruleKind })
  }
  const addGroup = (group: InfoGroup, lineage: string[]) => {
    if (group.hidden) return
    group.profiles?.forEach((profile) => addProfile(profile, 'rule', [...lineage, group.id], [group.id]))
    group.infoLinks?.forEach((link) => addRule(link, 'core'))
  }
  /** `weaponsOnly` keeps an unchosen option's weapons on the sheet without its abilities. */
  const addProfiles = (
    definition: Definition,
    lineage: string[],
    kind: AbilityKind = 'datasheet',
    ownRules = false,
    weaponsOnly = false,
  ) => {
    const owner = definitionTokens(definition)
    definition.profiles?.forEach((profile) => {
      if (weaponsOnly && isAbilityProfile(profile)) return
      addProfile(
        profile,
        kind,
        lineage,
        owner,
        definition.type === 'upgrade' && definition.name !== profile.name ? definition.name : undefined,
      )
    })
    if (!weaponsOnly) definition.infoGroups?.forEach((group) => addGroup(group, lineage))
    for (const link of definition.infoLinks ?? []) {
      const linkedRule = link.type === 'rule' ? loaded.index.rules.get(link.targetId) : undefined
      if (!weaponsOnly && !link.hidden && !linkedRule?.hidden && link.name && linkedRule?.description) {
        keywordRules.set(link.name.toLowerCase(), { name: link.name, description: linkedRule.description })
      }
      if (ownRules) addRule(link, 'faction')
      const shared = loaded.index.shared.get(link.targetId)
      if (!shared) continue
      if (
        'characteristics' in shared &&
        (!weaponsOnly || !isAbilityProfile(shared)) &&
        // A link hidden outright is never shown; one a roster condition hides stays, as a Weirdboy's Wurrband powers do.
        !(link.hidden && !flattenedModifiers([link]).some((modifier) => modifier.field === 'hidden'))
      ) {
        const profile = linkedProfile(link, shared)
        // Link modifiers apply only to fielded models, so an unfielded model's variant is the shared profile itself.
        const fielded = !selectedUnit || selected.has(definition.id)
        addProfile(
          fielded ? profile : { ...profile, id: shared.id },
          kind,
          [...lineage, link.id, shared.id],
          [...owner, link.id, shared.id],
        )
      }
    }
  }
  const visit = (definition: Definition, isRoot = false, ancestors: string[] = [], enhancement = false) => {
    if (visited.has(definition.id)) return
    visited.add(definition.id)
    const lineage = [...ancestors, ...definitionTokens(definition)]
    const resolved = targetOf(definition, loaded.index.definitions)
    /**
     * An entry the data hides on the sheet itself is something the unit is given
     * rather than something it has: a detachment enhancement hangs off the datasheet
     * it upgrades and is unhidden by the detachment that offers it. Printing it
     * regardless put a Pantheon of Woe enhancement on every Nightbringer, so it is
     * read like the enhancement group it belongs to and appears once it is taken.
     */
    const enhancementEntry =
      enhancement ||
      (!isRoot && Boolean(definition.hidden ?? resolved.hidden)) ||
      (resolved.type === undefined && (definition.name ?? resolved.name)?.toLowerCase().includes('enhancement'))
    const selectedUpgrade = selected.has(definition.id) || selected.has(resolved.id)
    const kind = !isRoot && resolved.type === 'upgrade' ? 'wargear' : 'datasheet'
    if (!enhancementEntry || selectedUpgrade) {
      addProfiles(
        definition,
        lineage,
        kind,
        isRoot,
        Boolean(selectedUnit && !context?.everyWargearAbility && kind === 'wargear' && !selectedUpgrade),
      )
    }
    definition.selectionEntries?.forEach((entry) => visit(entry, false, lineage, enhancementEntry))
    definition.selectionEntryGroups?.forEach((group) => visit(group, false, lineage, enhancementEntry))
    for (const link of definition.entryLinks ?? []) {
      visit(link, false, lineage, enhancementEntry)
      const target = loaded.index.definitions.get(link.targetId)
      if (!target) continue
      const targetLineage = [...lineage, ...definitionTokens(link), ...definitionTokens(target)]
      // A linked group may be a catalogue-wide library. Its own profile belongs
      // here; recursively importing all its children does not.
      const selectedTarget = selected.has(link.id) || selected.has(target.id)
      if (!enhancementEntry || selectedTarget) {
        addProfiles(target, targetLineage, 'wargear', false, Boolean(selectedUnit && !context?.everyWargearAbility && !selectedTarget))
      }
    }
  }
  // A book reaches most of its datasheets through a link, and everything a
  // datasheet displays — profiles, abilities, keywords — is on the entry the link
  // points at. The link is visited first because it may add to what it points at.
  const sheet = targetOf(root, loaded.index.definitions)
  visit(root, true)
  if (sheet !== root) visit(sheet, true, [root.id])

  const selection = selectedUnit ?? defaultSelection(root.id, loaded.index, { primaryCatalogueId: catalogueId })
  const choices = selection
    ? unitChoices(root.id, selection, loaded.index, {
        primaryCatalogueId: catalogueId,
        roster: context?.selections,
      })
    : []
  // What the datasheet offers sits on the options themselves, which a tank's sponsons
  // reach through a shared group of shared weapons the walk above does not enter.
  // `unitChoices` alone decides what is offered, so its options are the ones drawn:
  // every option's weapons, and the abilities only of the wargear the unit holds. An
  // enhancement's prose is shown with the choice itself, so its abilities are kept apart for the simulator.
  const visitOption = (node: Selection, ancestors: string[], withAbilities: boolean) => {
    const definition = loaded.index.definitions.get(node.id)
    if (!definition) return
    const target = targetOf(definition, loaded.index.definitions)
    const sources = definitionAndTarget(definition, loaded.index)
    const lineage = [...ancestors, ...sources.flatMap(definitionTokens)]
    const chosen = selected.has(definition.id) || selected.has(target.id)
    for (const source of sources) {
      if (visited.has(source.id)) continue
      visited.add(source.id)
      addProfiles(source, lineage, 'wargear', false, !chosen || !withAbilities)
      if (chosen && !withAbilities)
        source.profiles?.forEach((profile) =>
          addProfile(
            profile,
            'upgrade',
            lineage,
            definitionTokens(source),
            source.name !== profile.name ? source.name : undefined,
            enhancements,
          ),
        )
    }
    node.selections?.forEach((child) => visitOption(child, lineage, withAbilities))
  }
  for (const choice of choices) {
    const withAbilities = !choice.name.toLowerCase().includes('enhancement')
    for (const option of choice.options) {
      const built = defaultSelection(option.id, loaded.index, { primaryCatalogueId: catalogueId })
      if (built) visitOption(built, [root.id, ...choice.key.split('/').slice(0, -1)], withAbilities)
    }
  }

  const name = nameOf(root, loaded.index.definitions)
  const characteristicNames = loaded.characteristicNames
  const { keywords, modelKeywords } = selection
    ? unitKeywordsIn(loaded, catalogueId, entryId, { selection, roster: selectedUnit ? context?.selections : undefined })
    : unitKeywordsIn(loaded, catalogueId, entryId)
  const catalogueOptions = choices.map((choice) => ({
    name: choice.name,
    options: choice.options.map((option) => option.name).join('; '),
  }))

  const walkedProfiles = [...profiles.values()]
  // A stat line VS Data prints for the datasheet replaces the catalogue's, which a roster's modifiers then change.
  const vsLines = vsStatLinesOf(
    loaded.vsProfiles,
    catalogueId,
    entryId,
    name,
    walkedProfiles.map(({ profile }) => ({
      name: profile.name ?? '',
      type: profile.typeName ?? '',
      values: Object.fromEntries(
        (profile.characteristics ?? []).flatMap((value) =>
          value.name ? [[datasheetCharacteristicKind(value.name), value.$text ?? '']] : [],
        ),
      ),
    })),
  )
  const displayProfiles = walkedProfiles.flatMap(({ profile, lineage, owner }, at) => {
    if (!profile.name || !profile.typeName) return []
    const profileType = profile.typeName
    const weapon = profileType === 'Ranged Weapons' || profileType === 'Melee Weapons'
    const intrinsic = owner.includes(root.id) || owner.includes(sheet.id)
    if (selectedUnit && weapon && !context?.everyWeapon && referenceOnlyWeapon(profile.name)) return []
    // A shared profile several options link is stored once, under the last path the walk took, which may be an
    // unchosen option, so the carriers say whether a model holds it.
    if (
      selectedUnit &&
      weapon &&
      !context?.everyWeapon &&
      !intrinsic &&
      !equippedCounts.has(profile.id) &&
      !owner.some((id) => selected.has(id))
    )
      return []
    const equipment = weapon
      ? owner
          .map((id) => loaded.index.definitions.get(id))
          .findLast((definition) => definition && targetOf(definition, loaded.index.definitions).type === 'upgrade')
      : undefined
    const equipmentName = equipment ? nameOf(equipment, loaded.index.definitions) : undefined
    const profileLineage = [...lineage, profile.id]
    const hidden = modifiedProfileField(String(profile.hidden ?? false), 'hidden', profileType, profileLineage, owner, modifiers).value
    if (hidden === 'true') return []
    const changedName = modifiedProfileField(profile.name, 'name', profileType, profileLineage, owner, modifiers)
    const annotation = modifiedProfileField('', 'annotation', profileType, profileLineage, owner, modifiers).value
    const vsData = vsLines[at]
    const values = (profile.characteristics ?? []).flatMap((value) => {
      if (!value.name) return []
      const changed = modifiedProfileField(
        vsData?.[datasheetCharacteristicKind(value.name)] ?? value.$text ?? '',
        value.typeId,
        profileType,
        profileLineage,
        owner,
        modifiers,
        value.name === 'Keywords' ? ', ' : undefined,
      )
      return changed.value ? [{ name: value.name, ...changed }] : []
    })
    const present = new Set((profile.characteristics ?? []).map((value) => value.typeId).filter((id): id is string => Boolean(id)))
    const added = [
      ...new Set(
        modifiers
          .filter((modifier) => modifier.profileType === profileType && !present.has(modifier.field))
          .map((modifier) => modifier.field),
      ),
    ].flatMap((field) => {
      const characteristicName = characteristicNames.get(field)
      const changed = modifiedProfileField(
        '',
        field,
        profileType,
        profileLineage,
        owner,
        modifiers,
        characteristicName === 'Keywords' ? ', ' : undefined,
      )
      return characteristicName && changed.value ? [{ name: characteristicName, ...changed }] : []
    })
    const baseValues = [...values, ...added]
    const characteristicValues =
      profileType === 'Unit' ? addGrantedInvulnerableSave(baseValues, owner, grantedInvulnerableSaves) : baseValues
    const displayedValues = weapon
      ? addGrantedWeaponAbilities(characteristicValues, profileType, grantedWeaponAbilities)
      : characteristicValues
    return [
      {
        id: profile.id,
        name: annotation ? `${changedName.value} (${annotation})` : changedName.value,
        type: profileType,
        ...(equipmentName ? { equipmentName } : {}),
        ...(weapon && selectedUnit
          ? {
              count:
                equippedCounts.get(profile.id) ??
                wargearCounts.get(wargearKey(profile.name)) ??
                Math.max(1, ...owner.map((id) => selectedCounts.get(id) ?? 0)),
            }
          : {}),
        values: displayedValues,
      },
    ]
  })
  return {
    root,
    name,
    selection,
    choices,
    keywords,
    modelKeywords,
    catalogueOptions,
    profiles: uniqueProfiles(displayProfiles),
    abilities: uniqueAbilities(withGrantsOverLinks([...abilities.values()], grantedAbilities)),
    enhancements: [...enhancements.values()],
    keywordRules: [...keywordRules.values(), ...vsKeywordRules(loaded, vsLines, [...keywordRules.values()])],
  }
}

/** The rule of each weapon keyword a VS Data stat line prints that none of the catalogue's linked rules explains. */
function vsKeywordRules(
  loaded: LoadedCatalogue,
  lines: readonly (VsStatValues | null)[],
  linked: readonly Datasheet['keywordRules'][number][],
): Datasheet['keywordRules'] {
  const unexplained = [...new Set(lines.flatMap((line) => splitWeaponKeywords(line?.keywords)))].filter(
    (keyword) => !linked.some((rule) => ruleReferenceMatches(keyword, rule.name)),
  )
  return unexplained.length ? rulesNamed(loaded, unexplained) : []
}

type Keywords = { keywords: string[]; modelKeywords: NonNullable<Datasheet['modelKeywords']> }

const keywordCache = new WeakMap<LoadedCatalogue, Map<string, Keywords>>()

/** Read selected and granted keywords, not only linked profiles. Cache the default-selection answer per immutable snapshot, but not roster-context answers. */
export function keywordsIn(
  loaded: LoadedCatalogue,
  catalogueId: string,
  entryId: string,
  context?: { selection: Selection; roster?: readonly Selection[] },
): string[] {
  return unitKeywordsIn(loaded, catalogueId, entryId, context).keywords
}

function unitKeywordsIn(
  loaded: LoadedCatalogue,
  catalogueId: string,
  entryId: string,
  context?: { selection: Selection; roster?: readonly Selection[] },
): Keywords {
  const root = loaded.index.definitions.get(entryId)
  if (!root) return { keywords: [], modelKeywords: [] }
  if (context) {
    return keywordsOf(loaded, catalogueId, root, context.selection, context.roster)
  }
  return cachedIn(keywordCache, loaded, `${catalogueId}:${entryId}`, () =>
    keywordsOf(loaded, catalogueId, root, defaultSelection(entryId, loaded.index, { primaryCatalogueId: catalogueId }), undefined),
  )
}

function keywordsOf(
  loaded: LoadedCatalogue,
  catalogueId: string,
  root: Definition,
  selection: Selection | null | undefined,
  roster: readonly Selection[] | undefined,
): Keywords {
  const sheet = targetOf(root, loaded.index.definitions)
  const links = [...(root.categoryLinks ?? []), ...(sheet === root ? [] : (sheet.categoryLinks ?? []))]
  const written = new Map(links.flatMap((link) => (link.name ? [[link.targetId, link.name] as const] : [])))
  /**
   * The book's own wording for a keyword it prints, and the category's name for one
   * the list granted.
   *
   * Bookkeeping the data keeps for itself is printed either way: the attachment
   * markers, the weapon-matching helpers, the Assigned Agents allowances and the
   * paired Battleline categories a Chaos god's units are sorted into are all written
   * as ordinary links on the datasheet. However it came to be in one, it prints
   * nothing, so the category decides and not the way the datasheet reached it.
   */
  const wording = (id: string) => {
    const category = loaded.index.categories.get(id)
    if (category?.hidden) return []
    const printed = written.get(id) ?? category?.name
    return printed ? [printed] : []
  }
  const printed = (ids: readonly string[]) => [...new Set(ids.flatMap(wording))].toSorted()
  if (!selection) return { keywords: printed([...written.keys()]), modelKeywords: [] }
  const selections = roster?.includes(selection) ? roster : [selection]
  const held = unitKeywordIds(selections, selections.indexOf(selection), loaded.index, { primaryCatalogueId: catalogueId })
  return {
    keywords: printed(held.keywords),
    modelKeywords: modelOnlyKeywords(held.models.map((model) => ({ ...model, keywords: printed(model.keywords) }))),
  }
}

/** The keywords only some of a unit's models have, with the models that have each set. */
function modelOnlyKeywords(models: readonly { name: string; keywords: string[] }[]): Keywords['modelKeywords'] {
  // Faction keywords are the unit's, though the data links them only on Marneus Calgar and not his Victrix Honour Guard.
  const everyModel = new Set(
    models
      .flatMap((model) => model.keywords)
      .filter((keyword) => /^faction:/iu.test(keyword) || models.every((model) => model.keywords.includes(keyword))),
  )
  const groups = new Map<string, { models: string[]; keywords: string[] }>()
  for (const model of models) {
    const keywords = model.keywords.filter((keyword) => !everyModel.has(keyword))
    if (!keywords.length) continue
    const key = keywords.join('\0')
    const group = groups.get(key) ?? { models: [], keywords }
    group.models.push(model.name)
    groups.set(key, group)
  }
  return [...groups.values()]
}

/** Selected and offered-weapon views sharing the expensive roster modifier fold. */
type RosterContext = Omit<DatasheetContext, 'everyWeapon' | 'everyWargearAbility' | 'modifiers'>

/** The roster's context with the modifiers its other selections put on this unit's profiles. */
function withProfileModifiers(loaded: LoadedCatalogue, catalogueId: string, entryId: string, context: RosterContext) {
  const modifiers = profileModifiers(
    context.selections,
    entryId,
    loaded.index,
    { primaryCatalogueId: catalogueId },
    context.unitSelectionIndex,
    context.companions ?? [],
  )
  return { ...context, modifiers }
}

/** The weapons a unit carries in its roster, without the every-weapon view `datasheetViewsIn` also builds. */
export const selectedDatasheetIn = (loaded: LoadedCatalogue, catalogueId: string, entryId: string, context: RosterContext) =>
  datasheetIn(loaded, catalogueId, entryId, withProfileModifiers(loaded, catalogueId, entryId, context))

export function datasheetViewsIn(loaded: LoadedCatalogue, catalogueId: string, entryId: string, context: RosterContext) {
  const shared = withProfileModifiers(loaded, catalogueId, entryId, context)
  const selection = context.unitSelectionIndex === undefined ? undefined : context.selections[context.unitSelectionIndex]
  const options = { primaryCatalogueId: catalogueId, roster: context.selections.filter((entry) => entry !== selection) }
  return {
    carriers: selection ? combatCarriers(selection, loaded.index, options) : [],
    selected: datasheetIn(loaded, catalogueId, entryId, shared),
    available: datasheetIn(loaded, catalogueId, entryId, { ...shared, everyWeapon: true, everyWargearAbility: true }),
  }
}

export function detachmentAbilitiesIn(loaded: LoadedCatalogue, catalogueId: string, entryId: string) {
  const detachment = loaded.detachments.get(catalogueId)
  const project = (detachmentId?: string) => {
    const selectedDetachments: Selection[] =
      detachment && detachmentId
        ? [
            {
              id: detachment.wrapperId,
              selections: [{ id: detachment.groupId, selections: [{ id: detachmentId }] }],
            },
          ]
        : []
    const unit = defaultSelection(entryId, loaded.index, { primaryCatalogueId: catalogueId, roster: selectedDetachments })
    if (!unit) return []
    return (
      walk(
        loaded,
        catalogueId,
        entryId,
        { selections: [...selectedDetachments, unit], unitSelectionIndex: selectedDetachments.length, everyWargearAbility: true },
        true,
      )?.abilities ?? []
    )
  }
  const abilities = project()
  const base = new Set(abilities.map(abilitySignature))
  return {
    abilities,
    detachments:
      detachment?.options.flatMap((option) => {
        const added = project(option.id).filter((ability) => !base.has(abilitySignature(ability)))
        return added.length ? [{ id: option.id, name: option.name, abilities: added }] : []
      }) ?? [],
  }
}

const abilitySignature = (ability: Datasheet['abilities'][number]) =>
  JSON.stringify({ id: ability.id, name: ability.name, source: ability.source, description: ability.description, kind: ability.kind })

type GrantedWeaponAbility = { keyword: string; source: string; profileTypes: readonly string[] }
type GrantedInvulnerableSave = { value: string; source: string; originIds: readonly string[] }

function weaponAbilitiesFromDetachments(
  selections: readonly Selection[],
  unitSelectionIndex: number | undefined,
  loaded: LoadedCatalogue,
  catalogueId: string,
  selectedKeywordIds?: readonly string[],
): GrantedWeaponAbility[] {
  if (unitSelectionIndex === undefined) return []
  const optionIds = new Set(loaded.detachments.get(catalogueId)?.options.map((option) => option.id) ?? [])
  if (!optionIds.size) return []
  const keywordNames = (selectedKeywordIds ?? keywordIds(selections, unitSelectionIndex, loaded.index, { primaryCatalogueId: catalogueId }))
    .flatMap((id) => {
      const category = loaded.index.categories.get(id)
      const name = category?.name && withoutFactionPrefix(category.name)
      return name && !category?.hidden ? [normalizeKeywordSelector(name)] : []
    })
    .filter(Boolean)
  const found = new Map<string, GrantedWeaponAbility>()
  const selectedDefinitions = definitionsInSelections(
    selections,
    selections.map((_, index) => index),
    loaded.index,
  ).filter((definition) => optionIds.has(definition.id))
  for (const definition of selectedDefinitions) {
    const catalogueRules: { name: string; description: string }[] = []
    for (const source of definitionAndTarget(definition, loaded.index)) {
      for (const link of source.infoLinks ?? []) {
        if (link.type !== 'rule' || infoLinkHiddenByRules(link, loaded.index, { primaryCatalogueId: catalogueId, roster: selections }))
          continue
        const rule = loaded.index.rules.get(link.targetId)
        if (rule?.name && rule.description && !rule.hidden) catalogueRules.push({ name: rule.name, description: rule.description })
      }
      catalogueRules.push(
        ...(source.rules ?? []).flatMap((rule) =>
          rule.name && rule.description && !rule.hidden ? [{ name: rule.name, description: rule.description }] : [],
        ),
      )
    }
    const cardRules =
      loaded.datacards.detachmentRules.get(routeSlug(canonicalDetachmentName(nameOf(definition, loaded.index.definitions)))) ?? []
    const rules = mergeDetachmentRules(catalogueRules, cardRules)
    for (const rule of rules) {
      if (!rule.description) continue
      for (const grant of weaponGrantsIn(rule.description, loaded.index.textFacts)) {
        if (!matchesKeywordSelector(grant.recipients, keywordNames)) continue
        if (grant.exclusions && matchesKeywordSelector(grant.exclusions, keywordNames)) continue
        const granted = { keyword: grant.keyword, source: rule.name, profileTypes: grant.profileTypes }
        found.set(`${grant.keyword.toLowerCase()}:${grant.profileTypes.join(',')}:${rule.name}`, granted)
      }
    }
  }
  return [...found.values()]
}

function grantedAbilitiesInAttachedUnit(
  selections: readonly Selection[],
  unitSelectionIndex: number | undefined,
  companionIndexes: readonly number[],
  index: LoadedCatalogue['index'],
  catalogueId: string,
  selectedKeywordIds?: readonly string[],
  rosterKeywordIds?: readonly (readonly string[])[],
): Datasheet['abilities'] {
  if (unitSelectionIndex === undefined) return []
  const found = new Map<
    string,
    { name: string; models?: string; condition?: string; conditional?: true; sources: Set<string>; ids: Set<string> }
  >()
  const keywordsBySelection = companionIndexes.length
    ? (rosterKeywordIds ?? keywordIdsBySelection(selections, index, { primaryCatalogueId: catalogueId }))
    : []
  const selectedKeywords = new Set(
    (selectedKeywordIds ?? keywordsBySelection[unitSelectionIndex] ?? []).flatMap((id) => {
      const name = index.categories.get(id)?.name?.trim().toLowerCase()
      return name ? [name] : []
    }),
  )
  const character = selectedKeywords.has('character')
  const referencesAt = (at: number, keywordIdsAt: readonly string[]) => {
    const selection = selections[at]
    const definition = selection ? index.definitions.get(selection.id) : undefined
    const names = definition
      ? [nameOf(definition, index.definitions), nameOf(targetOf(definition, index.definitions), index.definitions)]
      : []
    const categories = keywordIdsAt.flatMap((id) => {
      const name = index.categories.get(id)?.name
      return name ? [withoutFactionPrefix(name)] : []
    })
    const abilities = selection
      ? definitionsInSelections([selection], [0], index).flatMap((selected) =>
          definitionAndTarget(selected, index).flatMap((source) => [
            ...linkedAbilityNames(source, index, catalogueId, selections),
            ...abilityProfileNames(source, index, absentIn(selections, [at], index)),
          ]),
        )
      : []
    return [...new Set([...names, ...categories, ...abilities])]
  }
  const selectedReferences = referencesAt(unitSelectionIndex, selectedKeywordIds ?? keywordsBySelection[unitSelectionIndex] ?? [])
  const companionReferences = companionIndexes.flatMap((at) => referencesAt(at, keywordsBySelection[at] ?? []))
  const collect = (indexes: readonly number[], origin: 'self' | 'companion') => {
    for (const at of indexes) {
      const absent = absentIn(selections, [at], index)
      for (const definition of definitionsInSelections(selections, [at], index)) {
        for (const source of definitionAndTarget(definition, index)) {
          const linkedAbilities = linkedAbilityNames(source, index, catalogueId, selections)
          const hasConditionalAbilityLink = flattenedModifiers([source]).some(
            (modifier) => modifier.type === 'add' && modifier.field === 'add-info' && isConditionalModifier(modifier),
          )
          for (const profile of abilityProfilesOf(source, index, absent)) {
            const description = profileDescription(profile)
            const grants = parsedAbilityGrants(
              description ? abilityGrantsIn(description, index.textFacts) : null,
              companionIndexes.length > 0,
              linkedAbilities,
              !hasConditionalAbilityLink,
              origin === 'self' ? companionReferences : selectedReferences,
            )
            for (const grant of grants) {
              // A rule printed on the datasheet that grants itself, as a Detachment rule naming the units it is for, is shown already.
              if (origin === 'self' && abilityKey(grant.name) === abilityKey(profile.name)) continue
              if (grant.recipient === 'bearer' && origin !== 'self') continue
              if (grant.recipient === 'leader' && (origin !== 'companion' || !character)) continue
              if (grant.recipient === 'models' && (origin !== 'companion' || !selectedKeywords.has(grant.models!.toLowerCase()))) continue
              const key = `${grant.name.toLowerCase()}:${grant.models?.toLowerCase() ?? ''}:${grant.condition?.toLowerCase() ?? ''}:${grant.conditional ?? ''}`
              const granted = found.get(key) ?? {
                name: grant.condition && !grant.name.endsWith('*') ? `${grant.name}*` : grant.name,
                models: grant.models,
                condition: grant.condition,
                conditional: grant.conditional,
                sources: new Set(),
                ids: new Set(),
              }
              granted.sources.add(profile.name)
              granted.ids.add(profile.id)
              found.set(key, granted)
            }
          }
        }
      }
    }
  }
  collect([unitSelectionIndex], 'self')
  collect(companionIndexes, 'companion')
  return [...found.values()].map(({ name, models, condition, conditional, sources, ids }) => {
    const rules = [...sources].toSorted()
    // VS Data types no words for a further condition, so the chip names the rules whose summaries give it. The name stays
    // as granted, since the simulator reads a Feel No Pain by it.
    const stated = [condition, conditional && `while ${rules.join(' or ')} applies`].filter(Boolean).join(' ')
    return {
      id: `granted:${[...ids].toSorted().join(':')}`,
      name,
      source: rules.join(', '),
      description: null,
      kind: 'core' as const,
      ...(models ? { models } : {}),
      ...(stated ? { condition: stated } : {}),
    }
  })
}

function linkedAbilityNames(
  definition: Definition,
  index: LoadedCatalogue['index'],
  catalogueId: string,
  selections: readonly Selection[],
) {
  const linked = (definition.infoLinks ?? []).flatMap((link) => {
    if (link.type !== 'rule' || contextualInfoLinkHidden(link, index, catalogueId, selections)) return []
    const rule = index.rules.get(link.targetId)
    const name = displayRuleName(link, link.name ?? rule?.name)
    return name && !rule?.hidden ? [name] : []
  })
  const added = flattenedModifiers([definition]).flatMap((modifier) => {
    if (modifier.type !== 'add' || modifier.field !== 'add-info' || typeof modifier.value !== 'string' || isConditionalModifier(modifier))
      return []
    const rule = index.rules.get(modifier.value)
    return rule?.name && !rule.hidden ? [rule.name] : []
  })
  return [...new Set([...linked, ...added])]
}

const contextualInfoLinkVisibilityCache = new WeakMap<LoadedCatalogue['index'], WeakMap<readonly Selection[], Map<string, boolean>>>()

function contextualInfoLinkHidden(
  link: InfoLink,
  index: LoadedCatalogue['index'],
  catalogueId: string,
  selections: readonly Selection[],
): boolean {
  if (!flattenedModifiers([link]).some((modifier) => modifier.field === 'hidden')) return Boolean(link.hidden)
  const byRoster = remember(contextualInfoLinkVisibilityCache, index, () => new WeakMap<readonly Selection[], Map<string, boolean>>())
  return cachedIn(byRoster, selections, `${catalogueId}:${link.id}`, () =>
    infoLinkHiddenByRules(link, index, { primaryCatalogueId: catalogueId, roster: selections }),
  )
}

function weaponAbilitiesInSelectedUnit(
  selections: readonly Selection[],
  unitSelectionIndex: number | undefined,
  index: LoadedCatalogue['index'],
): GrantedWeaponAbility[] {
  if (unitSelectionIndex === undefined) return []
  const found = new Map<string, GrantedWeaponAbility>()
  const absent = absentIn(selections, [unitSelectionIndex], index)
  for (const definition of definitionsInSelections(selections, [unitSelectionIndex], index)) {
    for (const source of definitionAndTarget(definition, index)) {
      for (const profile of abilityProfilesOf(source, index, absent)) {
        const description = profileDescription(profile)
        const grant = description ? ownWeaponGrantOf(description, index.textFacts) : null
        if (!grant) continue
        const granted = { keyword: grant.keyword, source: profile.name, profileTypes: grant.profileTypes }
        found.set(`${granted.keyword.toLowerCase()}:${granted.profileTypes.join(',')}:${granted.source}`, granted)
      }
    }
  }
  return [...found.values()]
}

function weaponAbilitiesInAttachedUnit(
  selections: readonly Selection[],
  unitSelectionIndex: number | undefined,
  companionIndexes: readonly number[],
  index: LoadedCatalogue['index'],
): GrantedWeaponAbility[] {
  if (unitSelectionIndex === undefined || !companionIndexes.length) return []
  const found = new Map<string, GrantedWeaponAbility>()
  for (const at of [unitSelectionIndex, ...companionIndexes]) {
    const absent = absentIn(selections, [at], index)
    for (const definition of definitionsInSelections(selections, [at], index)) {
      for (const source of definitionAndTarget(definition, index)) {
        for (const profile of abilityProfilesOf(source, index, absent)) {
          const description = profileDescription(profile)
          const grant = description ? ledWeaponGrantOf(description, index.textFacts) : null
          if (!grant) continue
          const { keyword, profileTypes } = grant
          found.set(`${profile.name}:${keyword}:${profileTypes.join(',')}`, { keyword, source: profile.name, profileTypes })
        }
      }
    }
  }
  return [...found.values()]
}

function invulnerableSavesInSelectedUnit(
  selections: readonly Selection[],
  unitSelectionIndex: number | undefined,
  index: LoadedCatalogue['index'],
): GrantedInvulnerableSave[] {
  if (unitSelectionIndex === undefined) return []
  return invulnerableSavesIn(
    definitionsInSelections(selections, [unitSelectionIndex], index),
    absentIn(selections, [unitSelectionIndex], index),
    index,
  )
}

/**
 * The saves a datasheet's own abilities give each model it can field, as its page shows them with no roster around it:
 * its units' and models', never wargear's, which only a roster that takes it has.
 */
function invulnerableSavesOnDatasheet(root: Definition, index: LoadedCatalogue['index']): GrantedInvulnerableSave[] {
  const found = new Map<string, Definition>()
  const visit = (definition: Definition) => {
    if (found.has(definition.id) || targetOf(definition, index.definitions).type === 'upgrade') return
    found.set(definition.id, definition)
    for (const source of definitionAndTarget(definition, index))
      for (const child of [...(source.selectionEntries ?? []), ...(source.selectionEntryGroups ?? []), ...(source.entryLinks ?? [])])
        visit(child)
  }
  visit(root)
  return invulnerableSavesIn([...found.values()], root.absentAbilities, index)
}

function invulnerableSavesIn(definitions: readonly Definition[], absent: AbsentAbilities, index: LoadedCatalogue['index']) {
  const found = new Map<string, GrantedInvulnerableSave>()
  for (const definition of definitions) {
    for (const source of definitionAndTarget(definition, index)) {
      for (const profile of abilityProfilesOf(source, index, absent)) {
        const description = profileDescription(profile)
        // An ability named for the save may hold its value alone, as a Legends datasheet's does.
        const value =
          description &&
          (invulnerableSaveOf(description, index.textFacts) ??
            (isWrittenInvulnerableSave(profile.name) ? bareValueOf(description, index.textFacts) : null))
        if (!value) continue
        // A save is its own model's alone, by id rather than by its type or keywords, which every model shares.
        const granted = {
          value,
          source: profile.name,
          originIds: [definition.id, 'targetId' in definition ? definition.targetId : undefined].filter((id): id is string => Boolean(id)),
        }
        found.set(JSON.stringify(granted), granted)
      }
    }
  }
  return [...found.values()]
}

function definitionsInSelections(
  selections: readonly Selection[],
  indexes: readonly number[],
  index: LoadedCatalogue['index'],
): Definition[] {
  const found = new Map<string, Definition>()
  const visit = (selection: Selection) => {
    const definition = index.definitions.get(selection.id)
    if (definition) found.set(definition.id, definition)
    selection.selections?.forEach(visit)
  }
  for (const at of indexes) {
    const selection = selections[at]
    if (selection) visit(selection)
  }
  return [...found.values()]
}

function addGrantedInvulnerableSave(
  values: Datasheet['profiles'][number]['values'],
  owner: readonly string[],
  saves: readonly GrantedInvulnerableSave[],
) {
  if (values.some((value) => value.name === 'InSv')) return values
  const save = saves.find((candidate) => candidate.originIds.some((id) => owner.includes(id)))
  if (!save) return values
  // A model's own written save is its characteristic, not one the roster grants, so VS Data's typed save may stand for it.
  if (isWrittenInvulnerableSave(save.source)) return [...values, { name: 'InSv', value: save.value }]
  return [...values, { name: 'InSv', value: save.value, baseValue: '', modifiers: [save.source] }]
}

function addGrantedWeaponAbilities(
  values: Datasheet['profiles'][number]['values'],
  profileType: string,
  abilities: readonly GrantedWeaponAbility[],
) {
  const granted = abilities.filter((ability) => ability.profileTypes.includes(profileType))
  if (!granted.length) return values
  const keywords = values.find((value) => value.name === 'Keywords')
  if (!keywords) {
    return [
      ...values,
      {
        name: 'Keywords',
        value: [...new Set(granted.map((ability) => ability.keyword))].join(', '),
        baseValue: '',
        modifiers: [...new Set(granted.map((ability) => ability.source))],
      },
    ]
  }
  const printed = new Set(splitWeaponKeywords(keywords.value).map((keyword) => keyword.toLowerCase()))
  const additions = granted.filter((ability) => !printed.has(ability.keyword.toLowerCase()))
  if (!additions.length) return values
  const changed = {
    ...keywords,
    value: [...new Set([...splitWeaponKeywords(keywords.value), ...additions.map((ability) => ability.keyword)])].join(', '),
    baseValue: keywords.baseValue ?? keywords.value,
    modifiers: [...new Set([...(keywords.modifiers ?? []), ...additions.map((ability) => ability.source)])],
  }
  return values.map((value) => (value === keywords ? changed : value))
}

function uniqueProfiles(profiles: Datasheet['profiles']) {
  return uniqueBy(profiles, (profile) =>
    JSON.stringify({
      name: profile.name.toLowerCase(),
      type: profile.type,
      count: profile.count,
      values: profile.values.map((value) => ({ ...value, value: comparableText(value.value) })),
    }),
  )
}

/**
 * A limited grant replaces the asterisked core rule the datasheet links for it, as "Feel No Pain 4+*", so one chip
 * says both what the asterisk means and where it came from.
 */
function withGrantsOverLinks(own: Datasheet['abilities'], granted: Datasheet['abilities']): Datasheet['abilities'] {
  const name = (ability: Datasheet['abilities'][number]) => ability.name.trim().toLowerCase()
  const linked = new Map(own.filter((ability) => ability.kind === 'core' && !ability.source).map((ability) => [name(ability), ability]))
  const replaced = new Set(granted.flatMap((ability) => (name(ability).endsWith('*') && linked.has(name(ability)) ? [name(ability)] : [])))
  return [
    ...own.filter((ability) => ability.kind !== 'core' || ability.source || !replaced.has(name(ability))),
    ...granted.flatMap((ability) => {
      if (replaced.has(name(ability))) return [{ ...ability, description: ability.description ?? linked.get(name(ability))!.description }]
      // A grant of a core ability every model links already, as Tempormortis's Fights First to a Judiciar, adds nothing.
      return linked.has(name(ability)) && !ability.models ? [] : [ability]
    }),
  ]
}

function uniqueAbilities(abilities: Datasheet['abilities']) {
  const wargearNames = new Set(
    abilities.filter((ability) => ability.kind === 'wargear').map((ability) => ability.name.trim().toLowerCase()),
  )
  return uniqueBy(
    abilities.filter((ability) => ability.kind === 'wargear' || !wargearNames.has(ability.name.trim().toLowerCase())),
    (ability) =>
      JSON.stringify({ name: ability.name.toLowerCase(), description: ability.description && comparableText(ability.description) }),
  )
}

export function datasheetInBySlug(loaded: LoadedCatalogue, catalogueId: string, slug: string) {
  const entryId = datasheetIdBySlug(loaded, catalogueId, slug)
  return entryId ? datasheetIn(loaded, catalogueId, entryId) : null
}

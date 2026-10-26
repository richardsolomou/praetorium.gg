import { withoutFactionPrefix } from '../core/name'
import { canonicalDetachmentName } from '../core/detachmentName'
import { cachedIn, remember, uniqueBy } from '../core/collections'
import { type Definition, definitionAndTarget, type InfoGroup, type InfoLink, nameOf, type Profile, targetOf } from '../core/catalogue'
import { withoutText } from './sourceText'
import { referenceAttachmentOf } from '../core/attach'
import {
  flattenedModifiers,
  infoLinkHiddenByRules,
  keywordIds,
  keywordIdsBySelection,
  type ModifierCache,
  profileModifiers,
  type ProfileModifier,
  type Selection,
  unitKeywordIds,
} from '../core/evaluate'
import { defaultSelection } from '../core/expand'
import { unitChoices, type UnitChoiceCache } from '../core/unitChoices'
import { wargearKey, wargearOf } from '../core/wargear'
import { combatCarriers, referenceOnlyWeapon } from '../core/combatLoadout'
import { ruleReferenceMatches, splitWeaponKeywords } from '../core/ruleReference'
import { routeSlug } from '../core/slug'
import { matchesKeywordSelector, normalizeKeywordSelector } from '../core/keywords'
import { datasheetIdBySlug, datasheetSlug, datasheetsOf, referenceDatasheetRoute, type LoadedCatalogue } from './catalogueIndex'
import { type DatasheetSearchFields, dedupeWeapons } from '../core/datasheetSearch'
import { priceOf } from './catalogueUnit'
import { datacardOf } from './datasheetJoin'
import { mergeDetachmentRules } from './catalogueDescriptions'
import { definitionTokens, displayRuleName, isConditionalModifier, modifiedProfileField } from './catalogueDisplay'
import { relationshipFor, relationshipsFor } from './catalogueRelationships'
import {
  deploymentAbilities,
  parseAbilityGrants,
  parsedAbilityGrants,
  titleCaseAbility,
  weaponProfileTypes,
} from './catalogueAbilityGrants'
import { weaponGrantsIn } from './textFacts'
import type { AbilityKind, Datasheet } from '../contracts/catalogue'

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

export function unitWoundsIn(loaded: LoadedCatalogue, catalogueId: string, entryIds: readonly string[]) {
  return unitBattleDetailsIn(loaded, catalogueId, entryIds).flatMap(({ entryId, wounds }) =>
    wounds === undefined ? [] : [{ entryId, wounds }],
  )
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
  choiceCache?: UnitChoiceCache
  modifierCache?: ModifierCache
}

const abilityDescription = (profile: Profile) =>
  profile.characteristics?.find((characteristic) => characteristic.name === 'Description')?.$text ?? null

type Walked = NonNullable<ReturnType<typeof walk>>

const walkCache = new WeakMap<LoadedCatalogue, Map<string, Walked | null>>()
const sheetCache = new WeakMap<LoadedCatalogue, Map<string, Datasheet | null>>()
const priceCache = new WeakMap<LoadedCatalogue, Map<string, number | null>>()

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

export function contextualAbilityNamesIn(
  loaded: LoadedCatalogue,
  catalogueId: string,
  entryId: string,
  context: Pick<DatasheetContext, 'selections' | 'unitSelectionIndex' | 'companions' | 'keywordIds' | 'rosterKeywordIds'>,
): string[] {
  const root = loaded.index.definitions.get(entryId)
  if (!root) return []
  const selected =
    context.unitSelectionIndex === undefined
      ? defaultSelection(entryId, loaded.index, { primaryCatalogueId: catalogueId })
      : context.selections[context.unitSelectionIndex]
  const definitions = selected ? definitionsInSelections([selected], [0], loaded.index) : []
  const intrinsic = [root, targetOf(root, loaded.index.definitions)]
  return [
    ...new Set([
      ...intrinsic.flatMap((definition) => linkedAbilityNames(definition, loaded.index, catalogueId, context.selections)),
      ...definitions.flatMap((definition) =>
        [definition, targetOf(definition, loaded.index.definitions)].flatMap((source) => abilityProfileNames(source, loaded.index)),
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

function abilityProfileNames(definition: Definition, index: LoadedCatalogue['index']): string[] {
  const names = new Set<string>()
  for (const profile of abilityProfilesOf(definition, index)) {
    const name = profile.name
    const description = normalizedAbilityDescription(profile)
    if (deploymentAbilities(name).length && description) {
      const parsed = parseAbilityGrants(description, false, [name], true)
      if (parsed.matched && !parsed.grants.some((grant) => ruleReferenceMatches(grant.name, name))) continue
    }
    names.add(name)
  }
  return [...names]
}

/** A definition's visible ability profiles: its own, its info groups', and those it links from the shared library. */
function abilityProfilesOf(definition: Definition, index: LoadedCatalogue['index']): (Profile & { name: string })[] {
  const found: (Profile & { name: string })[] = []
  const add = (profile: Profile) => {
    if (profile.typeName === 'Abilities' && profile.name && !profile.hidden) found.push({ ...profile, name: profile.name })
  }
  definition.profiles?.forEach(add)
  for (const group of definition.infoGroups ?? []) {
    if (!group.hidden) group.profiles?.forEach(add)
  }
  for (const link of definition.infoLinks ?? []) {
    if (link.hidden || link.type === 'rule') continue
    const shared = index.shared.get(link.targetId)
    if (!shared) continue
    if ('profiles' in shared) {
      if (!shared.hidden) shared.profiles?.forEach(add)
    } else add({ ...shared, name: link.name ?? shared.name })
  }
  return found
}

/** Ability names alone: roster pricing only needs to recognise deployment abilities. */
export const abilityNamesIn = (loaded: LoadedCatalogue, catalogueId: string, entryId: string): string[] => [
  ...new Set(walkRecord(loaded, catalogueId, entryId)?.abilities.map((ability) => ability.name) ?? []),
]

export function datasheetSearchFieldsIn(loaded: LoadedCatalogue, catalogueId: string, entryId: string): DatasheetSearchFields | null {
  const walked = walkRecord(loaded, catalogueId, entryId)
  if (!walked) return null
  const weapons = walked.profiles.filter((profile) => profile.type === 'Ranged Weapons' || profile.type === 'Melee Weapons')
  return {
    name: walked.name,
    keywords: walked.keywords,
    abilities: [...new Set(walked.abilities.filter((ability) => ability.kind !== 'rule').map((ability) => ability.name))],
    abilityDescriptions: walked.abilities.flatMap((ability) =>
      (ability.kind === 'datasheet' || ability.kind === 'wargear' || ability.kind === 'upgrade') && ability.description
        ? [{ name: ability.name, description: withoutText(ability.description) }]
        : [],
    ),
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
  return walked ? { name: walked.name, abilities: walked.abilities, keywords: walked.keywords } : null
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
    points: cachedIn(priceCache, loaded, `${catalogueId}:${entryId}`, () => priceOf(loaded, catalogueId, entryId)),
    keywords: walked.keywords,
    ...(walked.modelKeywords.length ? { modelKeywords: walked.modelKeywords } : {}),
    profiles: walked.profiles,
    abilities: walked.abilities,
    composition: details?.composition ?? [],
    ...(details?.modelCount ? { modelCount: details.modelCount } : {}),
    loadout: details?.loadout ?? null,
    wargearOptions: details?.wargear.length
      ? details.wargear
      : catalogueOptions.map(({ name: optionName, options }) => `**${optionName}:** ${options}.`),
    ...(details?.wargearGroups?.length ? { wargearGroups: details.wargearGroups } : {}),
    baseSize: details?.baseSize ?? null,
    transport: details?.transport ?? null,
    ...(details?.transportCapacity ? { transportCapacity: details.transportCapacity } : {}),
    costs: details?.points ?? [],
    attachments: attachment?.targets.map((target) => relationshipFor(loaded, catalogueId, target, attachment.kind)) ?? [],
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
          { primaryCatalogueId: catalogueId, modifierCache: context.modifierCache },
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
  const grantedInvulnerableSaves =
    context && !abilitiesOnly ? invulnerableSavesInSelectedUnit(context.selections, context.unitSelectionIndex, loaded.index) : []
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
  const keywordRules = new Map<string, Datasheet['keywordRules'][number]>()
  const visited = new Set<string>()
  const addProfile = (profile: Profile, kind: AbilityKind, lineage: string[], owner: string[], source?: string) => {
    if (profile.typeName === 'Abilities' && profile.name) {
      const profileLineage = [...lineage, profile.id]
      const hidden = modifiedProfileField(
        String(profile.hidden ?? false),
        'hidden',
        profile.typeName,
        profileLineage,
        owner,
        modifiers,
      ).value
      if (hidden === 'true') return
      abilities.set(`${kind}:${profile.id}`, { id: profile.id, name: profile.name, source, description: abilityDescription(profile), kind })
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
      if (weaponsOnly && profile.typeName === 'Abilities') return
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
      if ('characteristics' in shared && (!weaponsOnly || shared.typeName !== 'Abilities')) {
        addProfile({ ...shared, name: link.name ?? shared.name }, kind, [...lineage, link.id, shared.id], [...owner, link.id, shared.id])
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
        choiceCache: context?.choiceCache,
        modifierCache: context?.modifierCache,
      })
    : []
  // What the datasheet offers sits on the options themselves, which a tank's sponsons
  // reach through a shared group of shared weapons the walk above does not enter.
  // `unitChoices` alone decides what is offered, so its options are the ones drawn:
  // every option's weapons, and the abilities only of the wargear the unit holds. An
  // enhancement's prose is shown with the choice itself, so it is not an ability too.
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

  const displayProfiles = [...profiles.values()].flatMap(({ profile, lineage, owner }) => {
    if (!profile.name || !profile.typeName) return []
    const profileType = profile.typeName
    const weapon = profileType === 'Ranged Weapons' || profileType === 'Melee Weapons'
    const intrinsic = owner.includes(root.id) || owner.includes(sheet.id)
    if (selectedUnit && weapon && !context?.everyWeapon && referenceOnlyWeapon(profile.name)) return []
    if (selectedUnit && weapon && !context?.everyWeapon && !intrinsic && !owner.some((id) => selected.has(id))) return []
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
    const values = (profile.characteristics ?? []).flatMap((value) => {
      if (!value.name) return []
      const changed = modifiedProfileField(
        value.$text ?? '',
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
    abilities: uniqueAbilities([...abilities.values(), ...grantedAbilities]),
    keywordRules: [...keywordRules.values()],
  }
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
export function datasheetViewsIn(
  loaded: LoadedCatalogue,
  catalogueId: string,
  entryId: string,
  context: Omit<DatasheetContext, 'everyWeapon' | 'everyWargearAbility' | 'modifiers'>,
) {
  const modifiers = profileModifiers(
    context.selections,
    entryId,
    loaded.index,
    { primaryCatalogueId: catalogueId },
    context.unitSelectionIndex,
    context.companions ?? [],
  )
  const shared = { ...context, modifiers }
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
      for (const grant of weaponGrantsIn(rule.description, loaded.datacards.textFacts)) {
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
  const found = new Map<string, { name: string; models?: string; sources: Set<string>; ids: Set<string> }>()
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
          [selected, targetOf(selected, index.definitions)].flatMap((source) => [
            ...linkedAbilityNames(source, index, catalogueId, selections),
            ...abilityProfileNames(source, index),
          ]),
        )
      : []
    return [...new Set([...names, ...categories, ...abilities])]
  }
  const selectedReferences = referencesAt(unitSelectionIndex, selectedKeywordIds ?? keywordsBySelection[unitSelectionIndex] ?? [])
  const companionReferences = companionIndexes.flatMap((at) => referencesAt(at, keywordsBySelection[at] ?? []))
  const collect = (definitions: readonly Definition[], origin: 'self' | 'companion') => {
    for (const definition of definitions) {
      for (const source of [definition, targetOf(definition, index.definitions)]) {
        const linkedAbilities = linkedAbilityNames(source, index, catalogueId, selections)
        const hasConditionalAbilityLink = flattenedModifiers([source]).some(
          (modifier) => modifier.type === 'add' && modifier.field === 'add-info' && isConditionalModifier(modifier),
        )
        for (const profile of abilityProfilesOf(source, index)) {
          const grants = parsedAbilityGrants(
            abilityDescription(profile),
            companionIndexes.length > 0,
            linkedAbilities,
            !hasConditionalAbilityLink,
            origin === 'self' ? companionReferences : selectedReferences,
          )
          for (const grant of grants) {
            if (grant.recipient === 'bearer' && origin !== 'self') continue
            if (grant.recipient === 'leader' && (origin !== 'companion' || !character)) continue
            if (grant.recipient === 'models' && (origin !== 'companion' || !selectedKeywords.has(grant.models!.toLowerCase()))) continue
            const key = `${grant.name.toLowerCase()}:${grant.models?.toLowerCase() ?? ''}`
            const granted = found.get(key) ?? { name: grant.name, models: grant.models, sources: new Set(), ids: new Set() }
            granted.sources.add(profile.name)
            granted.ids.add(profile.id)
            found.set(key, granted)
          }
        }
      }
    }
  }
  collect(definitionsInSelections(selections, [unitSelectionIndex], index), 'self')
  collect(definitionsInSelections(selections, companionIndexes, index), 'companion')
  return [...found.values()].map(({ name, models, sources, ids }) => ({
    id: `granted:${[...ids].toSorted().join(':')}`,
    name,
    source: [...sources].toSorted().join(', '),
    description: null,
    kind: 'core',
    ...(models ? { models } : {}),
  }))
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
  for (const definition of definitionsInSelections(selections, [unitSelectionIndex], index)) {
    for (const source of definitionAndTarget(definition, index)) {
      for (const profile of abilityProfilesOf(source, index)) {
        const description = normalizedAbilityDescription(profile)
        const match = description?.match(
          /^(Ranged|Melee) weapons equipped by (?:the bearer|models in this unit) have (?:the )?\[([^\]]+)\] ability\.$/iu,
        )
        const unitAttacks = !match
          ? abilityDescription(profile)
              ?.normalize('NFKC')
              .trim()
              .match(/(?:^This unit['’]s|(?:^|\n\n)[A-Z][A-Z -]+ unit only\. This unit['’]s) (melee|ranged) attacks have \[([^\]]+)\]\.$/u)
          : null
        const grant = match ?? unitAttacks
        if (!grant) continue
        const granted = {
          keyword: grant[2]!.replace(/^[^:]+/, (name) => titleCaseAbility(name)),
          source: profile.name,
          profileTypes: weaponProfileTypes(grant[1]),
        }
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
  for (const definition of definitionsInSelections(selections, [unitSelectionIndex, ...companionIndexes], index)) {
    for (const source of [definition, targetOf(definition, index.definitions)]) {
      for (const profile of abilityProfilesOf(source, index)) {
        const description = normalizedAbilityDescription(profile)
        const match = description?.match(
          /^While this model is leading a unit, (?:(melee|ranged) )?weapons equipped by models in that unit have the \[([\p{L}\p{N} +'’\p{Pd}]+)\] ability\.$/iu,
        )
        if (!match) continue
        const keyword = titleCaseAbility(match[2]!)
        const profileTypes = weaponProfileTypes(match[1])
        found.set(`${profile.name}:${keyword}:${profileTypes.join(',')}`, { keyword, source: profile.name, profileTypes })
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
  const found = new Map<string, GrantedInvulnerableSave>()
  for (const definition of definitionsInSelections(selections, [unitSelectionIndex], index)) {
    for (const source of [definition, targetOf(definition, index.definitions)]) {
      for (const profile of abilityProfilesOf(source, index)) {
        const value = normalizedAbilityDescription(profile)?.match(/^This model has an? (\d+\+) invulnerable save\.$/i)?.[1]
        if (!value) continue
        const granted = { value, source: profile.name, originIds: definitionTokens(definition) }
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

const normalizedAbilityDescription = (profile: Profile) => abilityDescription(profile)?.normalize('NFKC').replaceAll(/\s+/g, ' ').trim()

function addGrantedInvulnerableSave(
  values: Datasheet['profiles'][number]['values'],
  owner: readonly string[],
  saves: readonly GrantedInvulnerableSave[],
) {
  if (values.some((value) => value.name === 'InSv')) return values
  const save = saves.find((candidate) => candidate.originIds.some((id) => owner.includes(id)))
  return save ? [...values, { name: 'InSv', value: save.value, baseValue: '', modifiers: [save.source] }] : values
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
        value: granted.map((ability) => ability.keyword).join(', '),
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
    value: [...splitWeaponKeywords(keywords.value), ...additions.map((ability) => ability.keyword)].join(', '),
    baseValue: keywords.baseValue ?? keywords.value,
    modifiers: [...new Set([...(keywords.modifiers ?? []), ...additions.map((ability) => ability.source)])],
  }
  return values.map((value) => (value === keywords ? changed : value))
}

function uniqueProfiles(profiles: Datasheet['profiles']) {
  return uniqueBy(profiles, (profile) =>
    JSON.stringify({ name: profile.name.toLowerCase(), type: profile.type, count: profile.count, values: profile.values }),
  )
}

function uniqueAbilities(abilities: Datasheet['abilities']) {
  const wargearNames = new Set(
    abilities.filter((ability) => ability.kind === 'wargear').map((ability) => ability.name.trim().toLowerCase()),
  )
  return uniqueBy(
    abilities.filter((ability) => ability.kind === 'wargear' || !wargearNames.has(ability.name.trim().toLowerCase())),
    (ability) => JSON.stringify({ name: ability.name.toLowerCase(), description: ability.description }),
  )
}

export function datasheetInBySlug(loaded: LoadedCatalogue, catalogueId: string, slug: string) {
  const entryId = datasheetIdBySlug(loaded, catalogueId, slug)
  return entryId ? datasheetIn(loaded, catalogueId, entryId) : null
}

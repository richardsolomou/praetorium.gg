import { type Definition, type InfoGroup, type InfoLink, nameOf, type Profile, targetOf } from '../core/catalogue'
import { attachmentOf } from '../core/attach'
import { infoLinkHiddenByRules, profileModifiers, type ProfileModifier, type Selection } from '../core/evaluate'
import { defaultSelection } from '../core/expand'
import { unitChoices } from '../core/unitChoices'
import { wargearOf } from '../core/wargear'
import { bracketedRuleReferences, ruleReferenceMatches } from '../core/ruleReference'
import { datasheetSlug, datasheetsOf, isReferenceDatasheet, type LoadedCatalogue } from './catalogueIndex'
import { isMatchedPlayDatasheet, priceOf } from './cataloguePicker'
import type { DatasheetDetails } from './datacards'

export type Datasheet = {
  id: string
  slug: string
  name: string
  points: number | null
  keywords: string[]
  profiles: {
    id: string
    name: string
    type: string
    count?: number
    values: { name: string; value: string; baseValue?: string; modifiers?: string[] }[]
  }[]
  abilities: { id: string; name: string; source?: string; description: string | null; kind: AbilityKind }[]
  composition: string[]
  loadout: string | null
  wargearOptions: string[]
  baseSize: string | null
  transport: string | null
  costs: DatasheetDetails['points']
  attachments: DatasheetDetails['attachesTo']
  leaders: string[]
  supporters: string[]
  keywordRules: { name: string; description: string }[]
}

type AbilityKind = 'core' | 'faction' | 'datasheet' | 'rule' | 'wargear'

type DatasheetContext = {
  selections: readonly Selection[]
  unitSelectionIndex?: number
  /** Whether to keep weapons the unit is not carrying. */
  everyWeapon?: boolean
  /** The units that count as this one, by position: a character and what it leads. */
  companions?: readonly number[]
  /** Shared by paired projections of the same roster and unit. */
  modifiers?: readonly ProfileModifier[]
}

const abilityDescription = (profile: Profile) =>
  profile.characteristics?.find((characteristic) => characteristic.name === 'Description')?.$text ?? null

const abilityNameCache = new WeakMap<LoadedCatalogue, Map<string, string[]>>()

/**
 * Ability names without projecting a complete display datasheet.
 *
 * Roster pricing only needs to recognize deployment abilities. Building profiles,
 * choices, attachment relationships and description text for every unit made that
 * small question pay nearly the whole datasheet-page cost.
 */
export function abilityNamesIn(loaded: LoadedCatalogue, catalogueId: string, entryId: string): string[] {
  const key = `${catalogueId}:${entryId}`
  const cache = abilityNameCache.get(loaded)
  const cached = cache?.get(key)
  if (cached) return cached
  if (!datasheetsOf(loaded.index, catalogueId).has(entryId)) return []
  const root = loaded.index.definitions.get(entryId)
  if (!root) return []

  const names = new Set<string>()
  const visited = new Set<string>()
  const addProfile = (profile: Profile) => {
    if (profile.typeName === 'Abilities' && profile.name && !profile.hidden) names.add(profile.name)
  }
  const addRule = (link: InfoLink) => {
    if (link.type !== 'rule' || infoLinkHiddenByRules(link, loaded.index, { primaryCatalogueId: catalogueId })) return
    const rule = loaded.index.rules.get(link.targetId)
    const name = displayRuleName(link, link.name ?? rule?.name)
    if (name && !rule?.hidden) names.add(name)
  }
  const addGroup = (group: InfoGroup) => {
    if (group.hidden) return
    group.profiles?.forEach(addProfile)
    group.infoLinks?.forEach(addRule)
  }
  const addProfiles = (definition: Definition, ownRules: boolean) => {
    definition.profiles?.forEach(addProfile)
    definition.infoGroups?.forEach(addGroup)
    for (const link of definition.infoLinks ?? []) {
      if (ownRules) addRule(link)
      const shared = loaded.index.shared.get(link.targetId)
      if (!shared) continue
      if ('profiles' in shared) addGroup({ ...shared, name: link.name ?? shared.name })
      else addProfile({ ...shared, name: link.name ?? shared.name })
    }
  }
  const visit = (definition: Definition, isRoot = false, enhancement = false) => {
    if (visited.has(definition.id)) return
    visited.add(definition.id)
    const enhancementEntry = enhancement || definition.name === 'Enhancements'
    if (!enhancementEntry) addProfiles(definition, isRoot)
    definition.selectionEntries?.forEach((entry) => visit(entry, false, enhancementEntry))
    definition.selectionEntryGroups?.forEach((group) => visit(group, false, enhancementEntry))
    for (const link of definition.entryLinks ?? []) {
      visit(link)
      const target = loaded.index.definitions.get(link.targetId)
      if (target) addProfiles(target, false)
    }
  }

  const sheet = targetOf(root, loaded.index.definitions)
  visit(root, true)
  if (sheet !== root) visit(sheet, true)
  const found = [...names]
  const entries = cache ?? new Map<string, string[]>()
  entries.set(key, found)
  if (!cache) abilityNameCache.set(loaded, entries)
  return found
}

/** Structured display data for one top-level datasheet, including linked shared profiles. */
export function datasheetIn(loaded: LoadedCatalogue, catalogueId: string, entryId: string, context?: DatasheetContext): Datasheet | null {
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
  const grantedWeaponAbilities = context
    ? weaponAbilitiesInAttachedUnit(context.selections, context.unitSelectionIndex, context.companions ?? [], loaded.index)
    : []
  const grantedInvulnerableSaves = context
    ? invulnerableSavesInSelectedUnit(context.selections, context.unitSelectionIndex, loaded.index)
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
  const wargearCounts = new Map(selectedUnit ? wargearOf(selectedUnit, loaded.index).map(({ name, count }) => [name, count]) : [])
  const profiles = new Map<string, { profile: Profile; lineage: string[]; owner: string[] }>()
  const abilities = new Map<string, Datasheet['abilities'][number]>()
  const keywordRules = new Map<string, Datasheet['keywordRules'][number]>()
  const visited = new Set<string>()
  const addProfile = (profile: Profile, kind: AbilityKind, lineage: string[], owner: string[], source?: string) => {
    if (profile.typeName === 'Abilities' && profile.name && !profile.hidden) {
      abilities.set(`${kind}:${profile.id}`, { id: profile.id, name: profile.name, source, description: abilityDescription(profile), kind })
    } else {
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
  const addProfiles = (definition: Definition, lineage: string[], kind: AbilityKind = 'datasheet', ownRules = false) => {
    const owner = definitionTokens(definition)
    definition.profiles?.forEach((profile) =>
      addProfile(
        profile,
        kind,
        lineage,
        owner,
        definition.type === 'upgrade' && definition.name !== profile.name ? definition.name : undefined,
      ),
    )
    definition.infoGroups?.forEach((group) => addGroup(group, lineage))
    for (const link of definition.infoLinks ?? []) {
      const linkedRule = link.type === 'rule' ? loaded.index.rules.get(link.targetId) : undefined
      if (!link.hidden && !linkedRule?.hidden && link.name && linkedRule?.description) {
        keywordRules.set(link.name.toLocaleLowerCase(), { name: link.name, description: linkedRule.description })
      }
      if (ownRules) addRule(link, 'faction')
      const shared = loaded.index.shared.get(link.targetId)
      if (!shared) continue
      if ('characteristics' in shared) {
        addProfile({ ...shared, name: link.name ?? shared.name }, kind, [...lineage, link.id, shared.id], [link.id, shared.id])
      }
    }
  }
  const visit = (definition: Definition, isRoot = false, ancestors: string[] = [], enhancement = false) => {
    if (visited.has(definition.id)) return
    visited.add(definition.id)
    const lineage = [...ancestors, ...definitionTokens(definition)]
    const enhancementEntry = enhancement || definition.name === 'Enhancements'
    if (!enhancementEntry || selected.has(definition.id)) addProfiles(definition, lineage, 'datasheet', isRoot)
    definition.selectionEntries?.forEach((entry) => visit(entry, false, lineage, enhancementEntry))
    definition.selectionEntryGroups?.forEach((group) => visit(group, false, lineage, enhancementEntry))
    for (const link of definition.entryLinks ?? []) {
      visit(link, false, lineage)
      const target = loaded.index.definitions.get(link.targetId)
      // A linked group may be a catalogue-wide library. Its own profile belongs
      // here; recursively importing all its children does not.
      if (target) addProfiles(target, [...lineage, ...definitionTokens(link), ...definitionTokens(target)], 'wargear')
    }
  }
  // A book reaches most of its datasheets through a link, and everything a
  // datasheet displays — profiles, abilities, keywords — is on the entry the link
  // points at. The link is visited first because it may add to what it points at.
  const sheet = targetOf(root, loaded.index.definitions)
  visit(root, true)
  if (sheet !== root) visit(sheet, true, [root.id])

  const keywords = [...(root.categoryLinks ?? []), ...(sheet === root ? [] : (sheet.categoryLinks ?? []))]
  const name = nameOf(root, loaded.index.definitions)
  const details = datacardDetails(loaded, name)
  const attachment = attachmentOf(root, loaded.index)
  const relationships = relationshipsFor(loaded, catalogueId, root.id, name)
  const characteristicNames = loaded.characteristicNames
  const selection = selectedUnit ?? defaultSelection(root.id, loaded.index, { primaryCatalogueId: catalogueId })
  const catalogueOptions = selection
    ? unitChoices(root.id, selection, loaded.index, { primaryCatalogueId: catalogueId }).map((choice) => ({
        name: choice.name,
        options: choice.options.map((option) => option.name).join('; '),
      }))
    : []

  const displayProfiles = [...profiles.values()].flatMap(({ profile, lineage, owner }) => {
    if (!profile.name || !profile.typeName) return []
    const profileType = profile.typeName
    const weapon = profileType === 'Ranged Weapons' || profileType === 'Melee Weapons'
    const intrinsic = owner.includes(root.id) || owner.includes(sheet.id)
    if (selectedUnit && weapon && !context?.everyWeapon && !intrinsic && !owner.some((id) => selected.has(id))) return []
    const profileLineage = [...lineage, profile.id]
    const hidden = modifiedProfileField(String(profile.hidden ?? false), 'hidden', profileType, profileLineage, owner, modifiers).value
    if (hidden === 'true') return []
    const changedName = modifiedProfileField(profile.name, 'name', profileType, profileLineage, owner, modifiers)
    const annotation = modifiedProfileField('', 'annotation', profileType, profileLineage, owner, modifiers).value
    const values = (profile.characteristics ?? []).flatMap((value) => {
      if (!value.name) return []
      const changed = modifiedProfileField(value.$text ?? '', value.typeId, profileType, profileLineage, owner, modifiers)
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
      const changed = modifiedProfileField('', field, profileType, profileLineage, owner, modifiers)
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
        ...(weapon && selectedUnit
          ? { count: wargearCounts.get(profile.name) ?? Math.max(1, ...owner.map((id) => selectedCounts.get(id) ?? 0)) }
          : {}),
        values: displayedValues,
      },
    ]
  })
  return {
    id: root.id,
    slug: datasheetSlug(loaded, catalogueId, root.id),
    name,
    points: priceOf(loaded, catalogueId, entryId),
    keywords: [...new Set(keywords.map((link) => link.name).filter((keyword): keyword is string => Boolean(keyword)))].toSorted(),
    profiles: uniqueProfiles(displayProfiles),
    abilities: uniqueAbilities([...abilities.values()]),
    composition: details?.composition ?? [],
    loadout: details?.loadout ?? null,
    wargearOptions: details?.wargear.length
      ? details.wargear
      : catalogueOptions.map(({ name: optionName, options }) => `**${optionName}:** ${options}.`),
    baseSize: details?.baseSize ?? null,
    transport: details?.transport ?? null,
    costs: details?.points ?? [],
    attachments: attachment?.targets.map((target) => ({ kind: attachment.kind, name: target })) ?? [],
    leaders: relationships.leaders,
    supporters: relationships.supporters,
    keywordRules: [...keywordRules.values()],
  }
}

/** Selected and offered-weapon views sharing the expensive roster modifier fold. */
export function datasheetViewsIn(
  loaded: LoadedCatalogue,
  catalogueId: string,
  entryId: string,
  context: Omit<DatasheetContext, 'everyWeapon' | 'modifiers'>,
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
  return {
    selected: datasheetIn(loaded, catalogueId, entryId, shared),
    available: datasheetIn(loaded, catalogueId, entryId, { ...shared, everyWeapon: true }),
  }
}

type GrantedWeaponAbility = { keyword: string; source: string; profileTypes: readonly string[] }
type GrantedInvulnerableSave = { value: string; source: string; originIds: readonly string[] }

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
      for (const profile of source.profiles ?? []) {
        if (profile.typeName !== 'Abilities' || !profile.name) continue
        const description = normalizedAbilityDescription(profile)
        const match = description?.match(
          /^While this model is leading a unit, (?:(melee|ranged) )?weapons equipped by models in that unit have the \[([\p{L}\p{N} +'’\p{Pd}]+)\] ability\.$/iu,
        )
        if (!match) continue
        const keyword = match[2]!.toLocaleLowerCase().replaceAll(/(^|[\s-])\p{L}/gu, (letter) => letter.toLocaleUpperCase())
        const profileTypes = match[1]
          ? [`${match[1][0]!.toLocaleUpperCase()}${match[1].slice(1).toLocaleLowerCase()} Weapons`]
          : ['Ranged Weapons', 'Melee Weapons']
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
      for (const profile of source.profiles ?? []) {
        if (profile.typeName !== 'Abilities' || !profile.name) continue
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
  const printed = new Set(keywords.value.split(',').map((keyword) => keyword.trim().toLocaleLowerCase()))
  const additions = granted.filter((ability) => !printed.has(ability.keyword.toLocaleLowerCase()))
  if (!additions.length) return values
  const changed = {
    ...keywords,
    value: [
      ...keywords.value
        .split(',')
        .map((keyword) => keyword.trim())
        .filter(Boolean),
      ...additions.map((ability) => ability.keyword),
    ].join(', '),
    baseValue: keywords.baseValue ?? keywords.value,
    modifiers: [...new Set([...(keywords.modifiers ?? []), ...additions.map((ability) => ability.source)])],
  }
  return values.map((value) => (value === keywords ? changed : value))
}

const relationshipCache = new WeakMap<LoadedCatalogue, Map<string, { leaders: string[]; supporters: string[] }>>()

function relationshipsFor(loaded: LoadedCatalogue, catalogueId: string, entryId: string, name: string) {
  const key = `${catalogueId}:${entryId}`
  const cache = relationshipCache.get(loaded)
  const cached = cache?.get(key)
  if (cached) return cached

  const leaders = new Set<string>()
  const supporters = new Set<string>()
  for (const candidateId of datasheetsOf(loaded.index, catalogueId)) {
    if (candidateId === entryId) continue
    const candidate = loaded.index.definitions.get(candidateId)
    if (!candidate || !isMatchedPlayDatasheet(loaded.index, candidate)) continue
    const attachment = attachmentOf(candidate, loaded.index)
    if (!attachment?.targets.some((target) => target.localeCompare(name, undefined, { sensitivity: 'accent' }) === 0)) continue
    const found = attachment.kind === 'leader' ? leaders : supporters
    found.add(nameOf(candidate, loaded.index.definitions))
  }
  const relationships = { leaders: [...leaders], supporters: [...supporters] }
  const entries = cache ?? new Map<string, { leaders: string[]; supporters: string[] }>()
  entries.set(key, relationships)
  if (!cache) relationshipCache.set(loaded, entries)
  return relationships
}

function uniqueProfiles(profiles: Datasheet['profiles']) {
  const seen = new Set<string>()
  return profiles.filter((profile) => {
    const signature = JSON.stringify({
      name: profile.name.toLocaleLowerCase(),
      type: profile.type,
      count: profile.count,
      values: profile.values,
    })
    if (seen.has(signature)) return false
    seen.add(signature)
    return true
  })
}

function uniqueAbilities(abilities: Datasheet['abilities']) {
  const wargearNames = new Set(
    abilities.filter((ability) => ability.kind === 'wargear').map((ability) => ability.name.trim().toLocaleLowerCase()),
  )
  const seen = new Set<string>()
  return abilities.filter((ability) => {
    if (ability.kind !== 'wargear' && wargearNames.has(ability.name.trim().toLocaleLowerCase())) return false
    const signature = JSON.stringify({ name: ability.name.toLocaleLowerCase(), description: ability.description })
    if (seen.has(signature)) return false
    seen.add(signature)
    return true
  })
}

function datacardDetails(loaded: LoadedCatalogue, name: string): DatasheetDetails | null {
  for (const content of loaded.factionContents.values()) {
    const details = content.datasheetDetails.get(name)
    if (details) return details
  }
  return null
}

export function datasheetInBySlug(loaded: LoadedCatalogue, catalogueId: string, slug: string) {
  const entryId = [...datasheetsOf(loaded.index, catalogueId)].find((id) => id === slug || datasheetSlug(loaded, catalogueId, id) === slug)
  return entryId && isReferenceDatasheet(loaded, catalogueId, entryId) ? datasheetIn(loaded, catalogueId, entryId) : null
}

function definitionTokens(definition: Definition) {
  return [
    definition.id,
    definition.type,
    'targetId' in definition ? definition.targetId : undefined,
    ...(definition.categoryLinks ?? []).flatMap((link) => [link.targetId, link.name]),
  ].filter((value): value is string => Boolean(value))
}

function modifiedProfileField(
  baseValue: string,
  field: string | undefined,
  profileType: string,
  lineage: readonly string[],
  owner: readonly string[],
  modifiers: readonly ProfileModifier[],
) {
  if (!field) return { value: baseValue }
  const applied = modifiers.filter(
    (modifier) =>
      modifier.field === field &&
      modifier.profileType === profileType &&
      modifier.filters.every((filter) => lineage.includes(filter)) &&
      profileInModifierScope(modifier, lineage, owner),
  )
  let value = baseValue
  const sources: string[] = []
  for (const modifier of applied.toSorted((left, right) => modifierOrder(left.type) - modifierOrder(right.type))) {
    const changed = applyDisplayModifier(value, modifier)
    if (changed === value) continue
    value = changed
    sources.push(modifier.source)
  }
  return value === baseValue ? { value: baseValue } : { value, baseValue, modifiers: [...new Set(sources)] }
}

function profileInModifierScope(modifier: ProfileModifier, lineage: readonly string[], owner: readonly string[]) {
  if (modifier.global) return true
  const ownsProfile = modifier.originIds.some((id) => owner.includes(id))
  if (!modifier.includeEntries) return modifier.includeSelf && ownsProfile
  const containsOrigin = modifier.originIds.some((id) => lineage.includes(id))
  return (modifier.includeSelf && ownsProfile) || containsOrigin
}

type DisplayModifier = Pick<ProfileModifier, 'type' | 'value' | 'arg' | 'position' | 'join' | 'skipIfPresent' | 'times'>

const MODIFIER_ORDER: Partial<Record<DisplayModifier['type'], number>> = {
  set: 0,
  append: 1,
  prepend: 1,
  increment: 2,
  decrement: 2,
  multiply: 2,
  divide: 2,
  modulo: 2,
  power: 2,
  exponent: 2,
  triangular: 2,
  floor: 3,
  ceil: 3,
  'cumulative-add': 4,
  'cumulative-power': 4,
  'cumulative-multiply': 4,
  replace: 4,
}

const modifierOrder = (type: DisplayModifier['type']) => MODIFIER_ORDER[type] ?? Number.MAX_SAFE_INTEGER

function displayRuleName(link: InfoLink, base: string | undefined) {
  if (!base) return
  const modifiers = (link.modifiers ?? [])
    .filter(
      (modifier) =>
        modifier.field === 'name' && !modifier.conditions?.length && !modifier.conditionGroups?.length && !modifier.repeats?.length,
    )
    .map((modifier) => ({ ...modifier, times: 1 }))
    .toSorted((left, right) => modifierOrder(left.type) - modifierOrder(right.type))
  return modifiers.reduce((name, modifier) => applyDisplayModifier(name, modifier), base)
}

function applyDisplayModifier(current: string, modifier: DisplayModifier) {
  const value = modifier.value
  const text = modifierText(value)
  switch (modifier.type) {
    case 'set':
      return text ?? current
    case 'append':
      if (text === null) return current
      if (modifier.skipIfPresent && current.includes(modifier.skipIfPresent)) return current
      return current ? `${current}${modifier.join ?? ' '}${text}` : text
    case 'prepend':
      if (text === null) return current
      if (modifier.skipIfPresent && current.includes(modifier.skipIfPresent)) return current
      return current ? `${text}${modifier.join ?? ' '}${current}` : text
    case 'increment':
      return modifyNumbers(current, modifier, (number) => number + Number(value) * modifier.times)
    case 'decrement':
      return modifyNumbers(current, modifier, (number) => number - Number(value) * modifier.times)
    case 'multiply':
      return modifyNumbers(current, modifier, (number) => number * Number(value) * modifier.times)
    case 'divide': {
      const divisor = Number(value) * modifier.times
      return modifyNumbers(current, modifier, (number) => (divisor === 0 ? 0 : number / divisor))
    }
    case 'modulo': {
      const divisor = Number(value) * modifier.times
      return modifyNumbers(current, modifier, (number) => (divisor === 0 ? 0 : number % divisor))
    }
    case 'power':
      return modifyNumbers(current, modifier, (number) => number ** (Number(value) * modifier.times))
    case 'exponent':
      return modifyNumbers(current, modifier, (number) => number * Number(value) ** modifier.times)
    case 'triangular':
      return modifyNumbers(current, modifier, (number) => number + (Number(value) * modifier.times * (modifier.times + 1)) / 2)
    case 'floor':
      return modifyNumbers(current, modifier, (number) => Math.max(number, Number(value)))
    case 'ceil':
      return modifyNumbers(current, modifier, (number) => Math.min(number, Number(value)))
    case 'cumulative-add':
      return modifyNumbers(current, modifier, (number) => number + Number(value) * ((modifier.times + 1) / 2))
    case 'cumulative-power':
      return modifyNumbers(current, modifier, (number) => {
        if (modifier.times === 0) return number
        let total = number
        for (let at = 1; at < modifier.times; at++) total += number * Number(value) ** at
        return total / modifier.times
      })
    case 'cumulative-multiply':
      return modifyNumbers(current, modifier, (number) => {
        let total = 0
        for (let at = 1; at <= modifier.times; at++) total += number * Number(value) ** at
        return total
      })
    case 'replace': {
      const replacement = text ?? ''
      if (!modifier.arg) return current ? current : replacement
      return replaceAt(current, new RegExp(escapeRegExp(modifier.arg), 'g'), modifier.position, () => replacement)
    }
    default:
      return current
  }
}

const modifierText = (value: unknown) =>
  typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean' ? String(value) : value === undefined ? '' : null

const NUMBER = /-?\d+(?:\.\d+)?/g

function modifyNumbers(current: string, modifier: DisplayModifier, change: (value: number) => number) {
  if (!Number.isFinite(Number(modifier.value))) return current
  if (!current) return String(change(0))
  return replaceAt(current, NUMBER, modifier.position, (found) => String(change(Number(found))))
}

function replaceAt(value: string, pattern: RegExp, position: number | string | undefined, replacement: (found: string) => string) {
  const at = Number(position) || 0
  if (at === 0) return value.replaceAll(pattern, replacement)
  const matches = [...value.matchAll(pattern)]
  const index = at < 0 ? matches.length + at : at - 1
  const match = matches[index]
  if (!match || match.index === undefined) return value
  return value.slice(0, match.index) + replacement(match[0]) + value.slice(match.index + match[0].length)
}

const escapeRegExp = (value: string) => value.replaceAll(/[.*+?^${}()|[\]\\]/g, '\\$&')

export function rulesReferencedIn(loaded: LoadedCatalogue, texts: readonly (string | null)[]) {
  return rulesNamed(
    loaded,
    texts.flatMap((text) => [
      ...[...(text ?? '').matchAll(/\*\*(.*?)\*\*|\^\^(.*?)\^\^/g)].flatMap((match) => {
        const name = (match[1] ?? match[2] ?? '').replaceAll(/\*\*|\^\^/g, '')
        return name ? [name] : []
      }),
      ...bracketedRuleReferences(text ?? '').filter((name): name is string => Boolean(name)),
    ]),
  )
}

/**
 * The rules these names are asking for, by name alone.
 *
 * A keyword a detachment appends to a weapon arrives as a bare word — the entry that
 * printed the profile links the rules it was printed with, and nothing links the one
 * that was added. Looking it up by name is how [ASSAULT] on a modified profile reads
 * the same as [ASSAULT] on a printed one. A name two catalogues describe differently
 * is dropped rather than guessed between.
 */
export function rulesNamed(loaded: LoadedCatalogue, names: readonly string[]) {
  const references = new Set(names)
  const candidates = new Map<string, Set<string>>()
  for (const rule of loaded.index.rules.values()) {
    if (!rule.name || !rule.description) continue
    if (![...references].some((reference) => ruleReferenceMatches(reference, rule.name!))) continue
    const descriptions = candidates.get(rule.name) ?? new Set<string>()
    descriptions.add(rule.description)
    candidates.set(rule.name, descriptions)
  }
  return [...candidates].flatMap(([name, descriptions]) =>
    descriptions.size === 1 ? [{ name, description: descriptions.values().next().value! }] : [],
  )
}

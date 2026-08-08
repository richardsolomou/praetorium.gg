/**
 * The community catalogue format, as the 11th edition data actually uses it.
 *
 * These are BattleScribe's shapes serialized as JSON rather than XML. The types
 * here cover the vocabulary present in the real files — two constraint types,
 * eight condition types, seven modifier types — and stop short of the display-only
 * parts, which no legality or points question depends on.
 *
 * With one exception, and it is not decoration: which units a character may be
 * attached to exists nowhere in the structure. It is a sentence inside an ability's
 * description, so `profiles` and `infoGroups` are carried for that alone. See
 * `attachmentOf`.
 *
 * Nothing in this file reads the filesystem or the network.
 */

export type CostType = { id: string; name: string; defaultCostLimit?: number; hidden?: boolean }

export type Cost = { name: string; typeId: string; value: number }

export type ConditionType =
  | 'atLeast'
  | 'atMost'
  | 'equalTo'
  | 'greaterThan'
  | 'lessThan'
  | 'instanceOf'
  | 'notInstanceOf'
  | 'before'
  | 'after'

/**
 * `field` is what to measure: `selections`, `forces`, or a cost type id.
 * `scope` is where: a keyword, or an entry id meaning "self or the nearest
 * ancestor with that id". `childId` is what counts: an entry id, or one of the
 * entry-type keywords.
 */
export type Condition = {
  type: ConditionType
  value: number
  field: string
  scope: string
  childId?: string
  shared?: boolean
  includeChildSelections?: boolean
  includeChildForces?: boolean
}

export type ConditionGroupType = 'and' | 'or' | 'atLeast' | 'atMost' | 'equalTo'

export type ConditionGroup = {
  type: ConditionGroupType
  value?: number
  conditions?: Condition[]
  conditionGroups?: ConditionGroup[]
  localConditionGroups?: LocalConditionGroup[]
}

/**
 * Counts how many selections in a scope satisfy its inner conditions, then
 * compares that count. This is how the data expresses "your second and later
 * copies of this unit cost more" — the inner conditions identify a copy, and the
 * count decides which copy this one is.
 */
export type LocalConditionGroup = {
  type: ConditionGroupType
  value?: number
  field: string
  scope: string
  childId?: string
  includeChildSelections?: boolean
  repeats?: number
  conditions?: Condition[]
  conditionGroups?: ConditionGroup[]
}

/** Applies a modifier once per `repeats` of whatever it counts — how per-model costs are expressed. */
export type Repeat = {
  value: number
  repeats?: number
  field: string
  scope: string
  childId?: string
  shared?: boolean
  includeChildSelections?: boolean
  roundUp?: boolean
}

export type ModifierType =
  | 'set'
  | 'increment'
  | 'decrement'
  | 'multiply'
  | 'append'
  | 'add'
  | 'remove'
  | 'replace'
  | 'set-primary'
  | 'unset-primary'

/** `field` is a cost type id, a constraint id, or a display field such as `name` or `hidden`. */
export type Modifier = {
  type: ModifierType
  field: string
  value: unknown
  scope?: string
  conditions?: Condition[]
  conditionGroups?: ConditionGroup[]
  repeats?: Repeat[]
}

export type ModifierGroup = {
  conditions?: Condition[]
  conditionGroups?: ConditionGroup[]
  repeats?: Repeat[]
  modifiers?: Modifier[]
  modifierGroups?: ModifierGroup[]
}

export type Constraint = {
  id: string
  type: 'min' | 'max'
  value: number
  field: string
  scope: string
  shared?: boolean
  includeChildSelections?: boolean
  percentValue?: boolean
}

export type EntryType = 'model' | 'unit' | 'upgrade' | 'model-or-unit'

/**
 * Membership of a keyword group — CHARACTER, INFANTRY, "Faction: Death Guard".
 *
 * Conditions ask about these constantly: an enhancement is available only inside a
 * model of its own faction, and that is written as a category test rather than a
 * name test.
 */
export type CategoryLink = { id: string; targetId: string; name?: string; primary?: boolean }

/**
 * A keyword, and what it limits.
 *
 * Eleventh edition's cap on how many of a datasheet a roster may hold is written
 * here rather than on the datasheet: every unit has a category named after itself,
 * and that category carries the number.
 */
export type CategoryEntry = {
  id: string
  name?: string
  constraints?: Constraint[]
  modifiers?: Modifier[]
  modifierGroups?: ModifierGroup[]
}

/** `$text` is where the JSON puts a characteristic's words. */
export type Characteristic = { name?: string; $text?: string }

export type Profile = { id: string; name?: string; typeName?: string; hidden?: boolean; characteristics?: Characteristic[] }

/** A named bundle of profiles hanging off an entry — "Leader" is one. */
export type InfoGroup = { id: string; name?: string; hidden?: boolean; profiles?: Profile[]; infoLinks?: InfoLink[] }

/** Display text defined once and referenced by a detachment or datasheet. */
export type Rule = { id: string; name?: string; description?: string; hidden?: boolean }

/** A reference to a profile or info group defined once at the catalogue's top level. */
export type InfoLink = { id: string; targetId: string; name?: string; hidden?: boolean; type?: 'profile' | 'infoGroup' | 'rule' }

type Common = {
  id: string
  name?: string
  comment?: string
  hidden?: boolean
  costs?: Cost[]
  constraints?: Constraint[]
  modifiers?: Modifier[]
  modifierGroups?: ModifierGroup[]
  selectionEntries?: SelectionEntry[]
  selectionEntryGroups?: SelectionEntryGroup[]
  entryLinks?: EntryLink[]
  categoryLinks?: CategoryLink[]
  profiles?: Profile[]
  infoGroups?: InfoGroup[]
  infoLinks?: InfoLink[]
}

export type SelectionEntry = Common & { type?: EntryType; collective?: boolean }

/** A container around entries. Having no type of its own is what distinguishes it. */
export type SelectionEntryGroup = Common & { type?: undefined; defaultSelectionEntryId?: string }

/** A reference to an entry or group defined elsewhere, carrying its own local additions. */
export type EntryLink = Common & { targetId: string; type?: 'selectionEntry' | 'selectionEntryGroup'; import?: boolean }

/**
 * One book borrowing another's roster.
 *
 * `importRootEntries` is what separates the two reasons a book links another:
 * Blood Angels link Space Marines to be able to take their datasheets, and Chaos
 * Daemons link Chaos Space Marines only to reach rules that mention them. Reading
 * every link as the first would offer a Daemons player the whole Traitor Legions
 * range.
 */
export type CatalogueLink = { targetId: string; name?: string; importRootEntries?: boolean }

export type Catalogue = {
  id: string
  name: string
  revision?: number
  library?: boolean
  gameSystemId?: string
  costTypes?: CostType[]
  forceEntries?: { id: string; name?: string }[]
  selectionEntries?: SelectionEntry[]
  sharedSelectionEntries?: SelectionEntry[]
  selectionEntryGroups?: SelectionEntryGroup[]
  sharedSelectionEntryGroups?: SelectionEntryGroup[]
  entryLinks?: EntryLink[]
  catalogueLinks?: CatalogueLink[]
  sharedProfiles?: Profile[]
  sharedInfoGroups?: InfoGroup[]
  sharedRules?: Rule[]
  categoryEntries?: CategoryEntry[]
}

/** A parsed file: the game system and every catalogue arrive in the same envelope. */
export type CatalogueFile = { gameSystem?: Catalogue; catalogue?: Catalogue }

export const POINTS_COST_NAME = 'pts'

export type Definition = SelectionEntry | SelectionEntryGroup | EntryLink

export type CatalogueIndex = {
  /** Every entry, group and link that carries an id, keyed by it. */
  definitions: Map<string, Definition>
  costTypes: Map<string, CostType>
  /** The cost type players mean when they say "points". */
  pointsTypeId: string
  /** Unit and model entries by name, for looking one up the way a person would. */
  unitsByName: Map<string, SelectionEntry[]>
  catalogues: Map<string, { id: string; name: string; revision?: number; library?: boolean; gameSystem: boolean }>
  /** Which catalogue each definition came from, for the chapter-specific pricing that asks. */
  catalogueOf: Map<string, string>
  /**
   * The datasheets each faction offers, keyed by catalogue id.
   *
   * A book states its own roster as links at its root, and borrows another book's
   * by importing a catalogue link — which is how Blood Angels reach the Space
   * Marines range, and how Astra Militarum reach a library holding every one of
   * their units and nothing else. Libraries and the game system are not keys here:
   * nobody plays them.
   *
   * Reading the entries at the top of a file instead answered "nothing" for eight
   * factions and offered a Burna Boy as a datasheet, because a body inside a squad
   * sits at the top of a file exactly as the squad does.
   */
  datasheets: Map<string, ReadonlySet<string>>
  /**
   * The kinds of force a roster can be — Army Roster, Boarding Actions, Crusade.
   * Conditions count and scope to these, so a roster needs one to answer them.
   */
  forces: { id: string; name: string }[]
  /**
   * Profiles and info groups defined once at a catalogue's top level, by id.
   *
   * Only `attachmentOf` reads these, and only because which units a character may
   * join is a sentence rather than a structure.
   */
  shared: Map<string, Profile | InfoGroup>
  /** Rules are display text, kept separately from profiles so links remain typed. */
  rules: Map<string, Rule>
  /** Categories by id, because that is where a datasheet's roster cap is written. */
  categories: Map<string, CategoryEntry>
  /** The data revision every roster and battle must pin, so two clients agree on legality. */
  revision: string
}

/**
 * Collects every definition in every file into one flat map.
 *
 * Links are indexed alongside their targets rather than resolved here: a link
 * carries its own constraints and costs, so flattening it into its target at
 * index time would lose them.
 */
export function buildIndex(files: readonly CatalogueFile[], revision: string): CatalogueIndex {
  const definitions = new Map<string, Definition>()
  const costTypes = new Map<string, CostType>()
  const unitsByName = new Map<string, SelectionEntry[]>()
  const catalogues = new Map<string, { id: string; name: string; revision?: number; library?: boolean; gameSystem: boolean }>()
  const catalogueOf = new Map<string, string>()
  const forces: { id: string; name: string }[] = []
  const books = new Map<string, Catalogue>()
  const shared = new Map<string, Profile | InfoGroup>()
  const rules = new Map<string, Rule>()
  const categories = new Map<string, CategoryEntry>()

  let owner = ''
  const collect = (node: Definition) => {
    if (node.id) {
      definitions.set(node.id, node)
      catalogueOf.set(node.id, owner)
    }
    if (node.name && (node.type === 'unit' || node.type === 'model')) {
      const existing = unitsByName.get(node.name) ?? []
      existing.push(node)
      unitsByName.set(node.name, existing)
    }
    for (const child of node.selectionEntries ?? []) collect(child)
    for (const child of node.selectionEntryGroups ?? []) collect(child)
    for (const child of node.entryLinks ?? []) collect(child)
  }

  for (const file of files) {
    const root = file.gameSystem ?? file.catalogue
    if (!root) continue
    catalogues.set(root.id, {
      id: root.id,
      name: root.name,
      revision: root.revision,
      library: root.library,
      gameSystem: Boolean(file.gameSystem),
    })
    for (const force of root.forceEntries ?? []) forces.push({ id: force.id, name: force.name ?? force.id })
    for (const profile of root.sharedProfiles ?? []) shared.set(profile.id, profile)
    for (const group of root.sharedInfoGroups ?? []) shared.set(group.id, group)
    for (const rule of root.sharedRules ?? []) rules.set(rule.id, rule)
    for (const category of root.categoryEntries ?? []) categories.set(category.id, category)
    if (file.catalogue) books.set(root.id, root)
    owner = root.id
    for (const costType of root.costTypes ?? []) costTypes.set(costType.id, costType)
    for (const child of [...(root.selectionEntries ?? []), ...(root.sharedSelectionEntries ?? [])]) collect(child)
    for (const child of root.selectionEntryGroups ?? []) collect(child)
    for (const child of root.sharedSelectionEntryGroups ?? []) collect(child)
    for (const child of root.entryLinks ?? []) collect(child)
  }

  const points = [...costTypes.values()].find((costType) => costType.name === POINTS_COST_NAME)
  if (!points) throw new Error(`no "${POINTS_COST_NAME}" cost type in this data`)

  return {
    definitions,
    costTypes,
    pointsTypeId: points.id,
    unitsByName,
    catalogues,
    catalogueOf,
    datasheets: datasheetsIn(books, definitions),
    forces,
    shared,
    rules,
    categories,
    revision,
  }
}

/** A link stands for its target: what an entry _is_ comes from there, not from the link. */
export function targetOf(definition: Definition, definitions: ReadonlyMap<string, Definition>): Definition {
  return 'targetId' in definition ? (definitions.get(definition.targetId) ?? definition) : definition
}

/** What to call an entry. A link usually repeats its target's name, and may replace it. */
export function nameOf(definition: Definition, definitions: ReadonlyMap<string, Definition>): string {
  return definition.name ?? targetOf(definition, definitions).name ?? definition.id
}

/**
 * The datasheets a book states at its root: the ones a player picks from it.
 *
 * `id` is what a roster would hold and `targetId` what that resolves to, which
 * are the same thing only when a book writes a datasheet out rather than linking
 * one — and most of the game is linked.
 */
export function rootEntriesOf(book: Catalogue, definitions: ReadonlyMap<string, Definition>) {
  const found: { id: string; targetId: string }[] = []
  for (const entry of book.selectionEntries ?? []) {
    if (entry.type === 'unit' || entry.type === 'model') found.push({ id: entry.id, targetId: entry.id })
  }
  for (const link of book.entryLinks ?? []) {
    const { type } = targetOf(link, definitions)
    if (type === 'unit' || type === 'model') found.push({ id: link.id, targetId: link.targetId })
  }
  return found
}

/**
 * The books this one takes its roster from, the one it takes most of first.
 *
 * Order is what settles the questions a book leaves open — an Imperial Fists list
 * is a Space Marines list that also reaches the Inquisition, and nothing but the
 * size of what it borrows says so.
 */
export function importsOf(book: Catalogue, books: ReadonlyMap<string, Catalogue>, definitions: ReadonlyMap<string, Definition>) {
  const imported: Catalogue[] = []
  for (const link of book.catalogueLinks ?? []) {
    const source = link.importRootEntries ? books.get(link.targetId) : undefined
    if (source) imported.push(source)
  }
  return imported.toSorted((left, right) => rootEntriesOf(right, definitions).length - rootEntriesOf(left, definitions).length)
}

/**
 * Which datasheets each faction may pick from.
 *
 * Runs once every file is indexed, because a book's roster is written as links
 * into other books and a link cannot be followed before its target is known.
 */
function datasheetsIn(books: ReadonlyMap<string, Catalogue>, definitions: ReadonlyMap<string, Definition>) {
  const datasheets = new Map<string, ReadonlySet<string>>()
  for (const book of books.values()) {
    if (book.library) continue
    // Keyed by what a pick would resolve to, so a datasheet reached both directly
    // and through an imported book is offered once — the book's own entry first,
    // since that is the one carrying anything it says locally.
    const found = new Map<string, string>()
    for (const source of [book, ...importsOf(book, books, definitions)]) {
      for (const entry of rootEntriesOf(source, definitions)) {
        if (!found.has(entry.targetId)) found.set(entry.targetId, entry.id)
      }
    }
    if (found.size) datasheets.set(book.id, new Set(found.values()))
  }
  return datasheets
}

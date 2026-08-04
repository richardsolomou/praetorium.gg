/**
 * The community catalogue format, as the 11th edition data actually uses it.
 *
 * These are BattleScribe's shapes serialized as JSON rather than XML. The types
 * here cover the vocabulary present in the real files — two constraint types,
 * eight condition types, seven modifier types — and deliberately stop short of
 * the display-only parts (profiles, rules, characteristics), which no legality
 * or points question depends on.
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

type Common = {
  id: string
  name?: string
  hidden?: boolean
  costs?: Cost[]
  constraints?: Constraint[]
  modifiers?: Modifier[]
  modifierGroups?: ModifierGroup[]
  selectionEntries?: SelectionEntry[]
  selectionEntryGroups?: SelectionEntryGroup[]
  entryLinks?: EntryLink[]
}

export type SelectionEntry = Common & { type?: EntryType; collective?: boolean }

/** A container around entries. Having no type of its own is what distinguishes it. */
export type SelectionEntryGroup = Common & { type?: undefined; defaultSelectionEntryId?: string }

/** A reference to an entry or group defined elsewhere, carrying its own local additions. */
export type EntryLink = Common & { targetId: string; type?: 'selectionEntry' | 'selectionEntryGroup'; import?: boolean }

export type Catalogue = {
  id: string
  name: string
  revision?: number
  library?: boolean
  gameSystemId?: string
  costTypes?: CostType[]
  forceEntries?: unknown[]
  selectionEntries?: SelectionEntry[]
  sharedSelectionEntries?: SelectionEntry[]
  selectionEntryGroups?: SelectionEntryGroup[]
  sharedSelectionEntryGroups?: SelectionEntryGroup[]
  entryLinks?: EntryLink[]
  catalogueLinks?: { targetId: string }[]
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
  catalogues: Map<string, { id: string; name: string; revision?: number }>
  /** Which catalogue each definition came from, for the chapter-specific pricing that asks. */
  catalogueOf: Map<string, string>
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
  const catalogues = new Map<string, { id: string; name: string; revision?: number }>()
  const catalogueOf = new Map<string, string>()

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
    catalogues.set(root.id, { id: root.id, name: root.name, revision: root.revision })
    owner = root.id
    for (const costType of root.costTypes ?? []) costTypes.set(costType.id, costType)
    for (const child of root.selectionEntries ?? []) collect(child)
    for (const child of root.sharedSelectionEntries ?? []) collect(child)
    for (const child of root.selectionEntryGroups ?? []) collect(child)
    for (const child of root.sharedSelectionEntryGroups ?? []) collect(child)
    for (const child of root.entryLinks ?? []) collect(child)
  }

  const points = [...costTypes.values()].find((costType) => costType.name === POINTS_COST_NAME)
  if (!points) throw new Error(`no "${POINTS_COST_NAME}" cost type in this data`)

  return { definitions, costTypes, pointsTypeId: points.id, unitsByName, catalogues, catalogueOf, revision }
}

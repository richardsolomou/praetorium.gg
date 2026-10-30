/**
 * Reading the catalogue's own entries, and the paths through them.
 *
 * The questions everything about building a list has to ask first: what does this
 * link resolve to, what does it hold, how many does the data insist on, how many will
 * it allow, and is this number one model's or the whole squad's. None of it changes a
 * list — it only reads what the data says about one.
 *
 * Pure, like the rest of `src/core`.
 */

import {
  type CatalogueIndex,
  type ConditionGroup,
  type Constraint,
  type Definition,
  definitionAndTarget,
  type Modifier,
  type ModifierGroup,
  resolve,
} from './catalogue'
import { isCollectiveGroup } from './collective'
import {
  type EvaluateOptions,
  flattenedModifiers,
  type ModifierCache,
  selectionCountBounds,
  selectionCountBoundsAt,
  type Selection,
} from './evaluate'

/**
 * How many catalogue containers deep a walk goes before it stops.
 *
 * A group is a container rather than a layer of the game, so a datasheet spends
 * depth fast: a Death Korps Watchmaster's pistol swap sits under a composition
 * group, a squad-size upgrade, a model group, the model, a wargear group, a
 * loadout upgrade and a weapon-option group, seven containers below the
 * datasheet. Nothing in the synced data changes beyond seven. Cycles are stopped
 * by the visited set rather than by this.
 */
export const MAX_DEPTH = 7

export const UNBOUNDED = Number.MAX_SAFE_INTEGER

/** One entry a group offers, reached by the id the path holds rather than the one it resolves to. */
export type Option = { id: string; definition: Definition }

export function childrenOf(definition: Definition, index: CatalogueIndex): Option[] {
  const found: Option[] = []
  for (const entry of definition.selectionEntries ?? []) found.push({ id: entry.id, definition: entry })
  for (const group of definition.selectionEntryGroups ?? []) found.push({ id: group.id, definition: group })
  for (const link of definition.entryLinks ?? []) {
    if (index.definitions.get(link.targetId)) found.push({ id: link.id, definition: link })
  }
  return found
}

/** Visits each definition reachable from `rootIds` once, by the entry it resolves to, so shared wargear is read once. */
export function eachDefinition(
  rootIds: Iterable<string>,
  index: CatalogueIndex,
  visit: (definition: Definition, target: Definition) => void,
) {
  const seen = new Set<string>()
  const walk = (definition: Definition) => {
    const target = resolve(definition, index)
    if (seen.has(target.id)) return
    seen.add(target.id)
    visit(definition, target)
    for (const child of childrenOf(target, index)) walk(child.definition)
  }
  for (const id of rootIds) {
    const root = index.definitions.get(id)
    if (root) walk(root)
  }
}

/** An option's price, including entries it must hold: a "2 Multi-meltas" option can carry its cost on the weapons. */
export function pointsOf(option: Option, index: CatalogueIndex, visited = new Set<string>()): number {
  const target = resolve(option.definition, index)
  const own =
    option.definition.costs?.find((cost) => cost.typeId === index.pointsTypeId)?.value ??
    target.costs?.find((cost) => cost.typeId === index.pointsTypeId)?.value ??
    0
  if (visited.has(target.id)) return own
  const seen = new Set([...visited, target.id])
  return childrenOf(target, index)
    .filter((child) => resolve(child.definition, index).type !== undefined)
    .reduce((total, child) => total + requiredCount(child.definition, index) * pointsOf(child, index, seen), own)
}

/** The binding cap on how many of this may be taken, or null when nothing limits it. */
export function maximumCount(definition: Definition, index: CatalogueIndex, options?: EvaluateOptions): number | null {
  if (options) return selectionCountBounds(definition, index, options).maximum
  const caps = constraintsOn(definition, index)
    .filter((constraint) => constraint.type === 'max' && constraint.field === 'selections' && !constraint.percentValue)
    .map((constraint) => constraint.value)
    .filter((value) => value >= 0)
  return caps.length ? Math.min(...caps) : null
}

/** A conditional increase applies now; a decrease must not hide the choice that can undo its condition. */
export function maximumCountAt(
  selection: Selection,
  path: readonly string[],
  definition: Definition,
  index: CatalogueIndex,
  options: EvaluateOptions = {},
): number | null {
  const declared = maximumCount(definition, index)
  const contextual = selectionCountBoundsAt(selection, path, index, options)?.maximum
  if (declared === null || contextual === null || contextual === undefined) return contextual ?? declared
  return Math.max(declared, contextual)
}

/** How many of this child the data insists on: its own minimum, or a group's. */
export function requiredCount(definition: Definition, index: CatalogueIndex, options?: EvaluateOptions): number {
  if (options) return selectionCountBounds(definition, index, options).minimum
  const minimums = constraintsOn(definition, index)
    .filter(isSelectionMinimum)
    .map((constraint) => constraint.value)
  return minimums.length ? Math.max(...minimums) : 0
}

export function hasMutableMinimum(definition: Definition, index: CatalogueIndex, cache?: ModifierCache): boolean {
  const minimums = new Set(
    constraintsOn(definition, index)
      .filter(isSelectionMinimum)
      .map((constraint) => constraint.id),
  )
  return flattenedModifiers(definitionAndTarget(definition, index), cache).some(
    (modifier) => minimums.has(modifier.field) && ['set', 'increment', 'decrement'].includes(modifier.type),
  )
}

export function hasDynamicSelectionLimit(definition: Definition, index: CatalogueIndex, cache?: ModifierCache): boolean {
  const maximums = new Set(
    constraintsOn(definition, index)
      .filter((constraint) => constraint.type === 'max' && constraint.field === 'selections')
      .map((constraint) => constraint.id),
  )
  return flattenedModifiers(definitionAndTarget(definition, index), cache).some(
    (modifier) => modifier.field === 'error' || (maximums.has(modifier.field) && ['set', 'increment', 'decrement'].includes(modifier.type)),
  )
}

/**
 * Whether taking this model lowers a squadmate's own limits, as a Sanctifier given the
 * simulacrum imperialis lowers the hand-flamer Sanctifiers': it takes one of their
 * places rather than adding a body.
 */
export function replacesSquadmate(definition: Definition, squadmates: readonly Option[], index: CatalogueIndex, cache?: ModifierCache) {
  const ids = new Set([definition.id, resolve(definition, index).id])
  const counted = (childId: string | undefined) => childId !== undefined && ids.has(childId)
  return squadmates.some((squadmate) => {
    if (ids.has(squadmate.id)) return false
    const limits = new Set(
      constraintsOn(squadmate.definition, index)
        .filter((constraint) => constraint.field === 'selections')
        .map((constraint) => constraint.id),
    )
    return flattenedModifiers(definitionAndTarget(squadmate.definition, index), cache).some(
      (modifier) =>
        modifier.type === 'decrement' &&
        limits.has(modifier.field) &&
        [...(modifier.repeats ?? []), ...(modifier.conditions ?? [])].some((counter) => counted(counter.childId)),
    )
  })
}

/** What the entry says about itself, plus what the link's target says, without repeating either. */
function constraintsOn(definition: Definition, index: CatalogueIndex): Constraint[] {
  return definitionAndTarget(definition, index).flatMap((source) => source.constraints ?? [])
}

const isSelectionMinimum = (constraint: Constraint) =>
  constraint.type === 'min' && constraint.field === 'selections' && (constraint.scope === 'parent' || constraint.scope === 'self')

/** The unit profile a model entry carries, which is what names its kind. */
export function modelProfileOf(definition: Definition, index: CatalogueIndex): string | null {
  const target = resolve(definition, index)
  const linked = (target.infoLinks ?? []).flatMap((link) => {
    const profile = link.type === 'profile' ? index.shared.get(link.targetId) : undefined
    return profile && 'typeName' in profile ? [profile] : []
  })
  return [...(target.profiles ?? []), ...linked].find((profile) => profile.typeName === 'Unit')?.name ?? null
}

/** Optional single entries with roster meaning rather than loadout meaning. */
export const isRosterToggle = (name: string | undefined) => name?.trim().toLowerCase() === 'warlord'

/**
 * Sets of entries the data will not let a unit hold together.
 *
 * "All models in this unit can each have their gauss blaster replaced with 1 tesla
 * carbine" has no number in it to constrain, so the catalogue writes it as an error
 * that fires when the unit holds one of each. Read the other way round, that names a
 * decision the squad takes once for all of it. Only a plain "and" of "holds at least
 * one of this" is read: anything else is some other rule, and guessing at it would
 * take away a choice a player is entitled to.
 */
export function exclusiveSets(definition: Definition): string[][] {
  const found: string[][] = []
  const collect = (modifier: Modifier, inherited: readonly ConditionGroup[]) => {
    if (modifier.field !== 'error' || modifier.type !== 'add') return
    for (const group of [...inherited, ...(modifier.conditionGroups ?? [])]) {
      const conditions = group.conditions ?? []
      if (group.type !== 'and' || conditions.length < 2) continue
      if (!conditions.every((condition) => condition.type === 'atLeast' && condition.value === 1 && condition.field === 'selections'))
        continue
      const named = conditions.flatMap((condition) => (condition.childId ? [condition.childId] : []))
      if (named.length === conditions.length) found.push(named)
    }
  }
  const walk = (group: ModifierGroup, inherited: readonly ConditionGroup[]) => {
    const chain = [...inherited, ...(group.conditionGroups ?? [])]
    for (const modifier of group.modifiers ?? []) collect(modifier, chain)
    for (const nested of group.modifierGroups ?? []) walk(nested, chain)
  }
  for (const modifier of definition.modifiers ?? []) collect(modifier, [])
  for (const group of definition.modifierGroups ?? []) walk(group, [])
  return found
}

/** The nearest ancestor model a path sits inside, when it is not the unit's own root. */
export function modelOwnerOf(trail: readonly string[], index: CatalogueIndex): { id: string; name: string; profile: string | null } | null {
  for (let length = trail.length; length > 0; length--) {
    const id = trail[length - 1]
    if (!id) continue
    const definition = index.definitions.get(id)
    if (!definition || resolve(definition, index).type !== 'model') continue
    const target = resolve(definition, index)
    // The id a selection is reached by, not the id it resolves to: a supplement links
    // the datasheet it borrows, and only the link appears in the path.
    return { id, name: definition.name ?? target.name ?? id, profile: modelProfileOf(definition, index) }
  }
  return null
}

/** A model on this path the squad may take more than one of, or must when it states no maximum, and where it stands. */
export function repeatedModelOn(path: readonly string[], index: CatalogueIndex): { path: string[]; definition: Definition } | null {
  const bound = (definition: Definition) => maximumCount(definition, index) ?? requiredCount(definition, index)
  // A model with no count of its own takes the group it sits in, as "2-5 Bullgryns" bounds its Bullgryn.
  return modelOnPath(path, index, (definition, group) => (bound(definition) || (group ? bound(group) : 0)) > 1)
}

/** A model on this path the squad need not take at all, but may take a bounded number of. */
function repeatableModelOn(path: readonly string[], index: CatalogueIndex): { path: string[]; definition: Definition } | null {
  return modelOnPath(path, index, (definition) => requiredCount(definition, index) === 0 && maximumCount(definition, index) !== null)
}

function modelOnPath(
  path: readonly string[],
  index: CatalogueIndex,
  accept: (definition: Definition, group: Definition | undefined) => boolean,
): { path: string[]; definition: Definition } | null {
  for (let length = path.length; length > 0; length--) {
    const id = path[length - 1]
    const definition = id ? index.definitions.get(id) : undefined
    if (!definition || resolve(definition, index).type !== 'model') continue
    if (accept(definition, enclosingGroupOf(path.slice(0, length), index))) return { path: path.slice(0, length), definition }
  }
  return null
}

/** The selection entry group directly holding the last entry on this path, if any. */
function enclosingGroupOf(path: readonly string[], index: CatalogueIndex): Definition | undefined {
  const parentId = path.at(-2)
  const parent = parentId ? index.definitions.get(parentId) : undefined
  return parent && resolve(parent, index).type === undefined ? parent : undefined
}

/**
 * The repeated model a group hangs off, when the group belongs to one model rather
 * than to the whole unit. A group of collective wargear belongs to the unit, so it
 * has no single carrier however many models are holding it.
 */
export function repeatedCarrierOn(groupPath: readonly string[], index: CatalogueIndex) {
  const groupId = groupPath.at(-1)
  const group = groupId ? index.definitions.get(groupId) : undefined
  if (!group || isCollectiveGroup(group, index)) return null
  const modelPath = groupPath.slice(0, -1)
  return repeatedModelOn(modelPath, index) ?? repeatableModelOn(modelPath, index)
}

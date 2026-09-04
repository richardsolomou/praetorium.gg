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
  type Modifier,
  type ModifierGroup,
  targetOf,
} from './catalogue'
import { isCollectiveGroup } from './collective'
import { type EvaluateOptions, flattenedModifiers, selectionCountBounds, selectionCountBoundsAt, type Selection } from './evaluate'

export { isCollective, isCollectiveGroup, scaleOf } from './collective'

/**
 * How many catalogue containers deep a walk goes before it stops.
 *
 * A group is a container rather than a layer of the game, so a datasheet spends
 * depth fast: a Firestrike Servo-Turret's mandatory weapon sits under a
 * composition group, a model, a wargear group and a weapon-option group, five
 * containers below the datasheet. Every mandatory shape in the synced data is
 * reached by five and nothing changes beyond it, so six is that with a container
 * to spare. Cycles are stopped by the visited set rather than by this.
 */
export const MAX_DEPTH = 6

export const UNBOUNDED = Number.MAX_SAFE_INTEGER

/** One entry a group offers, reached by the id the path holds rather than the one it resolves to. */
export type Option = { id: string; definition: Definition }

export const resolve = (definition: Definition, index: CatalogueIndex) => targetOf(definition, index.definitions)

export function childrenOf(definition: Definition, index: CatalogueIndex): Option[] {
  const found: Option[] = []
  for (const entry of definition.selectionEntries ?? []) found.push({ id: entry.id, definition: entry })
  for (const group of definition.selectionEntryGroups ?? []) found.push({ id: group.id, definition: group })
  for (const link of definition.entryLinks ?? []) {
    if (index.definitions.get(link.targetId)) found.push({ id: link.id, definition: link })
  }
  return found
}

export function pointsOf(option: Option, index: CatalogueIndex): number {
  const target = resolve(option.definition, index)
  const own = option.definition.costs?.find((cost) => cost.typeId === index.pointsTypeId)?.value
  return own ?? target.costs?.find((cost) => cost.typeId === index.pointsTypeId)?.value ?? 0
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

/**
 * An entry the squad shares a cap on, however many models could each hold one.
 *
 * "For every 3 models in this unit, 1 model can replace its plasma talon with 1
 * Astartes grenade launcher" is written as a per-model choice with a unit-wide cap
 * on one of its options, and that cap is the only thing naming which of them is the
 * replacement.
 */
export function isSharedAcrossUnit(definition: Definition, index: CatalogueIndex): boolean {
  return constraintsOn(definition, index).some(
    (constraint) =>
      constraint.type === 'max' && constraint.field === 'selections' && (constraint.scope === 'unit' || constraint.scope === 'unit-self'),
  )
}

export function hasMutableMinimum(definition: Definition, index: CatalogueIndex): boolean {
  const minimums = new Set(
    constraintsOn(definition, index)
      .filter(isSelectionMinimum)
      .map((constraint) => constraint.id),
  )
  const target = resolve(definition, index)
  return flattenedModifiers([definition, ...(target === definition ? [] : [target])]).some(
    (modifier) => minimums.has(modifier.field) && ['set', 'increment', 'decrement'].includes(modifier.type),
  )
}

export function hasDynamicSelectionLimit(definition: Definition, index: CatalogueIndex): boolean {
  const maximums = new Set(
    constraintsOn(definition, index)
      .filter((constraint) => constraint.type === 'max' && constraint.field === 'selections')
      .map((constraint) => constraint.id),
  )
  const target = resolve(definition, index)
  return flattenedModifiers([definition, ...(target === definition ? [] : [target])]).some(
    (modifier) => modifier.field === 'error' || (maximums.has(modifier.field) && ['set', 'increment', 'decrement'].includes(modifier.type)),
  )
}

/** What the entry says about itself, plus what the link's target says, without repeating either. */
function constraintsOn(definition: Definition, index: CatalogueIndex): Constraint[] {
  const target = resolve(definition, index)
  return [...(definition.constraints ?? []), ...(target === definition ? [] : (target.constraints ?? []))]
}

const isSelectionMinimum = (constraint: Constraint) =>
  constraint.type === 'min' && constraint.field === 'selections' && (constraint.scope === 'parent' || constraint.scope === 'self')

/** The unit profile a model entry carries, which is what names its kind. */
export function modelProfileOf(definition: Definition, index: CatalogueIndex): string | null {
  return resolve(definition, index).profiles?.find((profile) => profile.typeName === 'Unit')?.name ?? null
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

/** A model on this path the squad may take more than one of, and where it stands. */
export function repeatedModelOn(path: readonly string[], index: CatalogueIndex): { path: string[]; definition: Definition } | null {
  return modelOnPath(path, index, (definition) => (maximumCount(definition, index) ?? 1) > 1)
}

/** A model on this path the squad need not take at all, but may take a bounded number of. */
function repeatableModelOn(path: readonly string[], index: CatalogueIndex): { path: string[]; definition: Definition } | null {
  return modelOnPath(path, index, (definition) => requiredCount(definition, index) === 0 && maximumCount(definition, index) !== null)
}

function modelOnPath(
  path: readonly string[],
  index: CatalogueIndex,
  accept: (definition: Definition) => boolean,
): { path: string[]; definition: Definition } | null {
  for (let length = path.length; length > 0; length--) {
    const id = path[length - 1]
    const definition = id ? index.definitions.get(id) : undefined
    if (!definition || resolve(definition, index).type !== 'model') continue
    if (accept(definition)) return { path: path.slice(0, length), definition }
  }
  return null
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

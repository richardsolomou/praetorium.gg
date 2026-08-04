/**
 * Building a legal starting selection for a unit.
 *
 * Picking a unit in an army list does not mean picking a bare model: the
 * catalogue requires its mandatory wargear, and a squad requires a minimum
 * number of bodies. This produces that — the smallest selection the data would
 * accept — which is both what a player should be handed when they add a unit and
 * what any honest points check has to start from.
 *
 * Pure, like the rest of `src/core`.
 */

import type { CatalogueIndex, Constraint, Definition } from './catalogue'
import type { Selection } from './evaluate'

/** Crusade and campaign subtrees run deep and none of it is mandatory. */
const MAX_DEPTH = 4

export type DefaultOptions = { maxDepth?: number }

/**
 * The smallest legal selection of an entry, or null when the id is unknown.
 *
 * Only what the data insists on is included. An optional upgrade is a choice for
 * the player, and guessing at one would put points on a list nobody asked for.
 */
export function defaultSelection(entryId: string, index: CatalogueIndex, options: DefaultOptions = {}): Selection | null {
  const definition = index.definitions.get(entryId)
  if (!definition) return null
  return expand(entryId, definition, index, options.maxDepth ?? MAX_DEPTH, 1, new Set())
}

function expand(id: string, definition: Definition, index: CatalogueIndex, depth: number, count: number, seen: Set<string>): Selection {
  const target = resolve(definition, index)
  if (depth <= 0 || seen.has(target.id)) return { id, count }

  const visited = new Set(seen).add(target.id)
  const options = childrenOf(target, index).filter((child) => !child.definition.hidden)

  // A group holds no count of its own: "at least four selections of this group"
  // is satisfied by what goes inside it, so the requirement passes to a child.
  // Putting the number on the group itself leaves the group empty, which reads as
  // a squad with no models in it.
  if (target.type === undefined) {
    // Spread the requirement across what the group offers, respecting each
    // option's own cap: two selections from a group of one-each choices means one
    // of two things, not two of one.
    const inside: Selection[] = []
    let remaining = count
    for (const child of ordered(target, options, index)) {
      if (remaining <= 0) break
      const cap = maximumCount(child.definition, index)
      const take = cap === null ? remaining : Math.min(remaining, cap)
      if (take <= 0) continue
      inside.push(expand(child.id, child.definition, index, depth - 1, take, visited))
      remaining -= take
    }
    return inside.length ? { id, count: 1, selections: inside } : { id, count: 1 }
  }

  const children: Selection[] = []
  for (const child of options) {
    const required = requiredCount(child.definition, index)
    if (required <= 0) continue
    children.push(expand(child.id, child.definition, index, depth - 1, required, visited))
  }

  return children.length ? { id, count, selections: children } : { id, count }
}

type Option = { id: string; definition: Definition }

/**
 * What a group offers, best first: what it names as its default, then the cheapest,
 * then entries before nested groups.
 *
 * Cheapest matters. A mandatory choice has to be made for the player, and making
 * it an expensive one puts points on a list nobody asked for — the floor of a
 * datasheet is what this is for.
 */
function ordered(group: Definition, options: Option[], index: CatalogueIndex): Option[] {
  const named = 'defaultSelectionEntryId' in group ? group.defaultSelectionEntryId : undefined
  return options.toSorted(
    (left, right) =>
      Number(right.id === named) - Number(left.id === named) ||
      pointsOf(left, index) - pointsOf(right, index) ||
      kindOf(left, index) - kindOf(right, index),
  )
}

function pointsOf(option: Option, index: CatalogueIndex) {
  const target = resolve(option.definition, index)
  const own = option.definition.costs?.find((cost) => cost.typeId === index.pointsTypeId)?.value
  return own ?? target.costs?.find((cost) => cost.typeId === index.pointsTypeId)?.value ?? 0
}

const kindOf = (option: Option, index: CatalogueIndex) => (resolve(option.definition, index).type === undefined ? 1 : 0)

/** The binding cap on how many of this may be taken, or null when nothing limits it. */
function maximumCount(definition: Definition, index: CatalogueIndex): number | null {
  const target = resolve(definition, index)
  const constraints = [...(definition.constraints ?? []), ...(target === definition ? [] : (target.constraints ?? []))]
  const caps = constraints
    .filter((constraint) => constraint.type === 'max' && constraint.field === 'selections' && !constraint.percentValue)
    .map((constraint) => constraint.value)
    .filter((value) => value >= 0)
  return caps.length ? Math.min(...caps) : null
}

/** How many of this child the data insists on: its own minimum, or a group's. */
function requiredCount(definition: Definition, index: CatalogueIndex): number {
  const target = resolve(definition, index)
  const constraints = [...(definition.constraints ?? []), ...(target === definition ? [] : (target.constraints ?? []))]
  const minimums = constraints.filter(isSelectionMinimum).map((constraint) => constraint.value)
  return minimums.length ? Math.max(...minimums) : 0
}

const isSelectionMinimum = (constraint: Constraint) =>
  constraint.type === 'min' && constraint.field === 'selections' && (constraint.scope === 'parent' || constraint.scope === 'self')

function childrenOf(definition: Definition, index: CatalogueIndex) {
  const found: { id: string; definition: Definition }[] = []
  for (const entry of definition.selectionEntries ?? []) found.push({ id: entry.id, definition: entry })
  for (const group of definition.selectionEntryGroups ?? []) found.push({ id: group.id, definition: group })
  for (const link of definition.entryLinks ?? []) {
    const target = index.definitions.get(link.targetId)
    if (target) found.push({ id: link.id, definition: link })
  }
  return found
}

function resolve(definition: Definition, index: CatalogueIndex): Definition {
  return 'targetId' in definition ? (index.definitions.get(definition.targetId) ?? definition) : definition
}

/**
 * Lays `overrides` over a selection tree by path, so a caller can say "this unit,
 * but with five of that model" without restating its mandatory wargear.
 */
export function withCounts(selection: Selection, overrides: readonly { path: readonly string[]; count: number }[]): Selection {
  return overrides.reduce<Selection>((tree, override) => applyCount(tree, override.path, override.count), selection)
}

function applyCount(selection: Selection, path: readonly string[], count: number): Selection {
  const [next, ...rest] = path
  if (next === undefined) return { ...selection, count }

  const children = [...(selection.selections ?? [])]
  const at = children.findIndex((child) => child.id === next)
  const existing = children[at] ?? { id: next, count: 1 }
  const replaced = applyCount(existing, rest, count)
  if (at >= 0) children[at] = replaced
  else children.push(replaced)

  return { ...selection, selections: children }
}

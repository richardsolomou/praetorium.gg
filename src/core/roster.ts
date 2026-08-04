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
  const children: Selection[] = []

  for (const child of childrenOf(target, index)) {
    if (child.definition.hidden) continue
    const required = requiredCount(child.definition, index)
    if (required <= 0) continue
    children.push(expand(child.id, child.definition, index, depth - 1, required, visited))
  }

  return children.length ? { id, count, selections: children } : { id, count }
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

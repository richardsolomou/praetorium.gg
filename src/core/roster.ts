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
      const cap = maximumCount(child.definition, index)
      const share = remaining > 0 ? (cap === null ? remaining : Math.min(remaining, cap)) : 0
      // A child's own minimum applies whatever the group asks for, so a group with
      // no requirement still yields what its contents demand.
      const take = Math.max(share, requiredCount(child.definition, index))
      if (take <= 0) continue
      inside.push(expand(child.id, child.definition, index, depth - 1, take, visited))
      remaining -= Math.min(remaining, take)
    }
    return inside.length ? { id, count: 1, selections: inside } : { id, count: 1 }
  }

  const children: Selection[] = []
  for (const child of options) {
    const required = requiredCount(child.definition, index)
    if (resolve(child.definition, index).type === undefined) {
      // Always look inside a group. One with no minimum of its own can still hold
      // entries that insist on themselves — which is how most squads are written —
      // and skipping it leaves the unit with a sergeant and nobody to lead.
      const built = expand(child.id, child.definition, index, depth - 1, required, visited)
      if (built.selections?.length) children.push(built)
      continue
    }
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

/**
 * How many models a unit may field, and which selection to change to resize it.
 *
 * A datasheet is a fixed part — a sergeant, a champion, a dedicated transport's
 * hull — plus one group whose size the player chooses. The bounds live on that
 * group and govern the *sum* of what is inside it, so they cannot be pushed onto
 * an individual occupant: a group of five to ten holding a sergeant and a body
 * would otherwise report a minimum of six for a five-model squad.
 */
export type UnitSize = { min: number; max: number; models: number; path: string[] }

type BoundedGroup = { min: number; max: number; total: number; adjust: string[] }

const UNBOUNDED = Number.MAX_SAFE_INTEGER

export function unitSize(entryId: string, index: CatalogueIndex): UnitSize | null {
  const base = defaultSelection(entryId, index)
  return base ? sizeOf(base, index) : null
}

/** Whether the data lets a player change how many models this unit fields. */
export const isResizable = (size: UnitSize) => size.path.length > 0 && size.max > size.min

/** The unit as the data hands it over, resized to `models` when the data allows it. */
export function buildUnit(entryId: string, index: CatalogueIndex, models?: number): { selection: Selection; size: UnitSize } | null {
  const base = defaultSelection(entryId, index)
  if (!base) return null
  const size = sizeOf(base, index)
  if (models === undefined || !size.path.length) return { selection: base, size }

  const wanted = Math.min(Math.max(models, size.min), size.max)
  if (wanted === size.models) return { selection: base, size }

  const current = countAt(base, size.path)
  const selection = withCounts(base, [{ path: size.path, count: Math.max(0, current + (wanted - size.models)) }])
  return { selection, size: { ...size, models: wanted } }
}

function sizeOf(base: Selection, index: CatalogueIndex): UnitSize {
  const { models, groups } = survey(base, index, [])
  const total = models + groups.reduce((sum, group) => sum + group.total, 0)
  // A character or a vehicle is one model and has no model children: the entry
  // itself is the body, so a unit with nothing beneath it still fields one.
  if (!total) return { min: 1, max: 1, models: 1, path: [] }

  const flexible = groups.toSorted((left, right) => right.max - right.min - (left.max - left.min))[0]
  if (!flexible) return { min: total, max: total, models: total, path: [] }

  const others = total - flexible.total
  return { min: others + flexible.min, max: others + flexible.max, models: total, path: flexible.adjust }
}

/** Models that cannot vary, and the groups that can. */
function survey(selection: Selection, index: CatalogueIndex, trail: string[]): { models: number; groups: BoundedGroup[] } {
  let models = 0
  const groups: BoundedGroup[] = []

  for (const child of selection.selections ?? []) {
    const definition = index.definitions.get(child.id)
    if (!definition) continue
    const target = resolve(definition, index)
    const here = [...trail, child.id]
    const nested = survey(child, index, here)

    if (target.type === 'model') {
      const count = child.count ?? 1
      const min = requiredCount(definition, index)
      const max = maximumCount(definition, index) ?? UNBOUNDED
      // A squad is not always written as a group: sometimes the bodies hang
      // directly off the unit and carry their own bounds.
      if (max > min) groups.push({ min, max, total: count, adjust: here })
      else models += count
      groups.push(...nested.groups)
      continue
    }

    const inside = nested.models + nested.groups.reduce((sum, group) => sum + group.total, 0)
    if (target.type === undefined && inside > 0) {
      // A group's bounds are often absent and carried by its occupants instead,
      // so fall back to what they add up to rather than reporting no limit.
      const occupants = occupantBounds(child, index)
      const min = requiredCount(definition, index) || occupants.min
      const max = maximumCount(definition, index) ?? occupants.max
      if (max > min) {
        groups.push({ min, max, total: inside, adjust: widest(child, index, here) ?? here })
        continue
      }
    }

    models += nested.models
    groups.push(...nested.groups)
  }

  return { models, groups }
}

/** What a group's model occupants add up to, for when the group states no bounds itself. */
function occupantBounds(group: Selection, index: CatalogueIndex): { min: number; max: number } {
  let min = 0
  let max = 0
  for (const child of group.selections ?? []) {
    const definition = index.definitions.get(child.id)
    if (!definition || resolve(definition, index).type !== 'model') continue
    min += requiredCount(definition, index)
    max = Math.min(UNBOUNDED, max + (maximumCount(definition, index) ?? UNBOUNDED))
  }
  return { min, max: max || UNBOUNDED }
}

/** Which occupant of a group to grow: the one the data lets take the most. */
function widest(group: Selection, index: CatalogueIndex, trail: string[]): string[] | null {
  let best: { path: string[]; max: number } | null = null
  for (const child of group.selections ?? []) {
    const definition = index.definitions.get(child.id)
    if (!definition) continue
    if (resolve(definition, index).type !== 'model') continue
    const max = maximumCount(definition, index) ?? UNBOUNDED
    if (!best || max > best.max) best = { path: [...trail, child.id], max }
  }
  return best?.path ?? null
}

function countAt(selection: Selection, path: readonly string[]): number {
  const [next, ...rest] = path
  if (next === undefined) return selection.count ?? 1
  const child = (selection.selections ?? []).find((candidate) => candidate.id === next)
  return child ? countAt(child, rest) : 0
}

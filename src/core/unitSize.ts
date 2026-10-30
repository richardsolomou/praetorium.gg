/**
 * How many models a unit fields, and which selection to change to resize it.
 *
 * A datasheet is a fixed part — a sergeant, a champion, a dedicated transport's hull —
 * plus one group whose size the player chooses. The bounds live on that group and
 * govern the *sum* of what is inside it, so they cannot be pushed onto an individual
 * occupant: a group of five to ten holding a sergeant and a body would otherwise
 * report a minimum of six for a five-model squad.
 */

import { type CatalogueIndex, resolve } from './catalogue'
import { childrenOf, maximumCount, replacesSquadmate, requiredCount, UNBOUNDED } from './definitions'
import type { Selection } from './evaluate'
import { defaultSelection } from './expand'

export type UnitSize = { min: number; max: number; models: number; path: string[]; options?: number[] }

/** A group whose size the data lets the player change, and the selection to change. */
type BoundedGroup = { min: number; max: number; total: number; adjust: string[] }

/** Every group in this selection whose size can vary, for a caller scaling all of them at once. */
export const boundedGroups = (selection: Selection, index: CatalogueIndex): BoundedGroup[] => survey(selection, index, []).groups

export function unitSize(entryId: string, index: CatalogueIndex): UnitSize | null {
  const base = defaultSelection(entryId, index)
  return base ? sizeOf(base, index) : null
}

/** How many models an already-built or imported selection actually contains. */
export function modelCountOf(selection: Selection, index: CatalogueIndex): number {
  const counted = survey(selection, index, [])
  return counted.models + counted.groups.reduce((total, group) => total + group.total, 0)
}

/** Whether the data lets a player change how many models this unit fields. */
export const isResizable = (size: UnitSize) => size.path.length > 0 && size.max > size.min

/** Beyond this a list is a scroll rather than a choice, and some data states no upper bound at all. */
const LISTED_MODEL_COUNTS = 30

/** The model counts a player can pick directly; empty when there is nothing to choose or too much to list. */
export function modelCountChoices({ min, max, options }: { min: number; max: number; options?: readonly number[] }): number[] {
  const span = max - min + 1
  const choices = options
    ? options.filter((count) => count >= min && count <= max)
    : span <= LISTED_MODEL_COUNTS
      ? Array.from({ length: span }, (_, offset) => min + offset)
      : []
  return choices.length > 1 ? choices : []
}

export function sizeOf(base: Selection, index: CatalogueIndex): UnitSize {
  const { models, groups } = survey(base, index, [])
  const total = models + groups.reduce((sum, group) => sum + group.total, 0)
  // A character or a vehicle is one model and has no model children: the entry
  // itself is the body, so a unit with nothing beneath it still fields one.
  if (!total) return { min: 1, max: 1, models: 1, path: [] }

  // The squad a datasheet sizes is the group it must field; an optional one beside
  // it, such as a pack of beasts, can span more without being what the size means.
  const flexible = groups.toSorted(
    (left, right) => Number(right.min > 0) - Number(left.min > 0) || right.max - right.min - (left.max - left.min),
  )[0]
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
      // directly off the unit and carry their own bounds. A specialist taking a
      // squadmate's place is not one of them: the squad is the same size either way.
      if (max > min && !replacesSquadmate(definition, squadmatesIn(selection, index), index))
        groups.push({ min, max, total: count, adjust: here })
      else models += count
      groups.push(...nested.groups)
      continue
    }

    const inside = nested.models + nested.groups.reduce((sum, group) => sum + group.total, 0)
    if (target.type === undefined && inside > 0) {
      // A group of specialists taking squadmates' places, as a Skitarii Rangers' options
      // lower the galvanic-rifle Rangers', fields the same squad whatever it holds.
      if (replacesSquadmate(definition, squadmatesIn(selection, index), index)) {
        models += inside
        continue
      }
      const stated = maximumCount(definition, index)
      // A group of models fixed at a size fields that many, whatever range each occupant
      // could take within it; its default body is still what a specialist swaps out.
      // A fixed group of composition upgrades counts the choice, not the models.
      if (stated !== null && stated > 0 && stated === requiredCount(definition, index) && holdsModels(child, index)) {
        groups.push({ min: stated, max: stated, total: inside, adjust: widest(child, index, here) ?? here })
        continue
      }
      // A group's bounds are often absent and carried by its occupants instead,
      // so fall back to what they add up to rather than reporting no limit.
      const occupants = occupantBounds(child, index)
      const min = requiredCount(definition, index) || occupants.min
      const max = stated ?? occupants.max
      if (max > min && (min > 0 || max < UNBOUNDED)) {
        groups.push({ min, max, total: inside, adjust: widest(child, index, here) ?? here })
        continue
      }
    }

    models += nested.models
    groups.push(...nested.groups)
  }

  // An optional group of models not yet taken, such as a Broadside's Shas'ui, is still how the unit grows.
  const taken = new Set((selection.selections ?? []).map((child) => child.id))
  const squadmates = squadmatesIn(selection, index)
  for (const option of squadmates) {
    const target = resolve(option.definition, index)
    if (taken.has(option.id) || target.type !== undefined || requiredCount(option.definition, index) > 0) continue
    if (replacesSquadmate(option.definition, squadmates, index)) continue
    const occupants = childrenOf(target, index)
    if (!occupants.length || occupants.some((occupant) => resolve(occupant.definition, index).type !== 'model')) continue
    const widestOccupant = occupants
      .map((occupant) => ({ id: occupant.id, max: maximumCount(occupant.definition, index) ?? UNBOUNDED }))
      .reduce((best, occupant) => (occupant.max > best.max ? occupant : best))
    const max =
      maximumCount(option.definition, index) ??
      occupantBounds({ id: option.id, selections: occupants.map(({ id }) => ({ id })) }, index).max
    if (max > 0 && max < UNBOUNDED) groups.push({ min: 0, max, total: 0, adjust: [...trail, option.id, widestOccupant.id] })
  }

  return { models, groups }
}

/** Whether a group holds only models, directly or through groups of models. */
const holdsModels = (group: Selection, index: CatalogueIndex): boolean =>
  (group.selections ?? []).every((child) => {
    const definition = index.definitions.get(child.id)
    const type = definition && resolve(definition, index).type
    return type === 'model' || (definition !== undefined && type === undefined && holdsModels(child, index))
  })

/** What a group's model occupants add up to, for when the group states no bounds itself. */
function occupantBounds(group: Selection, index: CatalogueIndex): { min: number; max: number } {
  let min = 0
  let max = 0
  const squadmates = squadmatesIn(group, index)
  for (const child of group.selections ?? []) {
    const definition = index.definitions.get(child.id)
    if (!definition || resolve(definition, index).type !== 'model' || replacesSquadmate(definition, squadmates, index)) continue
    min += requiredCount(definition, index)
    max = Math.min(UNBOUNDED, max + (maximumCount(definition, index) ?? UNBOUNDED))
  }
  return { min, max: max || UNBOUNDED }
}

/** What a unit or group offers, for asking which of its models take another's place. */
function squadmatesIn(selection: Selection, index: CatalogueIndex) {
  const definition = index.definitions.get(selection.id)
  return definition ? childrenOf(resolve(definition, index), index) : []
}

/** Which occupant of a group to grow: the one the data lets take the most. */
function widest(group: Selection, index: CatalogueIndex, trail: string[]): string[] | null {
  let best: { path: string[]; max: number } | null = null
  for (const child of group.selections ?? []) {
    const definition = index.definitions.get(child.id)
    if (!definition) continue
    const target = resolve(definition, index)
    if (target.type === 'model') {
      const max = maximumCount(definition, index) ?? UNBOUNDED
      if (!best || max > best.max) best = { path: [...trail, child.id], max }
      continue
    }
    if (target.type !== undefined) continue
    const nested = widest(child, index, [...trail, child.id])
    if (!nested) continue
    const nestedDefinition = index.definitions.get(nested.at(-1)!)
    const max = nestedDefinition ? (maximumCount(nestedDefinition, index) ?? UNBOUNDED) : 0
    if (!best || max > best.max) best = { path: nested, max }
  }
  return best?.path ?? null
}

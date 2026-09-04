/**
 * Building a legal starting selection for a unit.
 *
 * Picking a unit in an army list does not mean picking a bare model: the catalogue
 * requires its mandatory wargear, and a squad requires a minimum number of bodies.
 * This produces that — the smallest selection the data would accept — which is both
 * what a player should be handed when they add a unit and what any honest points check
 * has to start from.
 *
 * Pure, like the rest of `src/core`.
 */

import type { CatalogueIndex, Definition } from './catalogue'
import {
  childrenOf,
  hasDynamicSelectionLimit,
  MAX_DEPTH,
  maximumCount,
  type Option,
  pointsOf,
  requiredCount,
  resolve,
  scaleOf,
} from './definitions'
import { evaluate, type EvaluateOptions, hiddenByRules, type Selection } from './evaluate'
import { updateSelection, withCounts, withPlaceFor } from './selection'

export type DefaultOptions = EvaluateOptions & { maxDepth?: number }

/**
 * The smallest legal selection of an entry, or null when the id is unknown.
 *
 * Only what the data insists on is included. An optional upgrade is a choice for
 * the player, and guessing at one would put points on a list nobody asked for.
 */
export function defaultSelection(entryId: string, index: CatalogueIndex, options: DefaultOptions = {}): Selection | null {
  const definition = index.definitions.get(entryId)
  if (!definition) return null
  return expand(entryId, definition, index, options.maxDepth ?? MAX_DEPTH, 1, new Set(), 1, options)
}

export function expand(
  id: string,
  definition: Definition,
  index: CatalogueIndex,
  depth: number,
  count: number,
  seen: Set<string>,
  carriers: number,
  options: DefaultOptions = {},
): Selection {
  const target = resolve(definition, index)
  if (depth <= 0 || seen.has(target.id)) return { id, count }

  const visited = new Set(seen).add(target.id)
  const available = childrenOf(target, index).filter((child) => !hiddenByRules(child.definition, index, options))

  // A group holds no count of its own: "at least four selections of this group"
  // is satisfied by what goes inside it, so the requirement passes to a child.
  // Putting the number on the group itself leaves the group empty, which reads as
  // a squad with no models in it.
  if (target.type === undefined) {
    // Spread the requirement across what the group offers, respecting each
    // option's own cap: two selections from a group of one-each choices means one
    // of two things, not two of one.
    const inside: Selection[] = []
    // Reserve room for options with their own minimum before the declared default
    // consumes the group's allowance. Mixed squads commonly put the ordinary
    // model first and a required sergeant later in the catalogue.
    const reserved = available.reduce(
      (total, child) => total + requiredCount(child.definition, index, options) * scaleOf(child.definition, index, carriers),
      0,
    )
    let remaining = Math.max(0, count - reserved)
    for (const child of ordered(target, available, index)) {
      const scale = scaleOf(child.definition, index, carriers)
      const minimum = requiredCount(child.definition, index, options) * scale
      const cap = maximumCount(child.definition, index, options)
      const room = cap === null ? null : Math.max(0, cap * scale - minimum)
      const share = remaining > 0 ? (room === null ? remaining : Math.min(remaining, room)) : 0
      // A child's own minimum applies whatever the group asks for, so a group with
      // no requirement still yields what its contents demand.
      const take = minimum + share
      if (take <= 0 && resolve(child.definition, index).type === undefined) {
        const built = expand(child.id, child.definition, index, depth - 1, 0, visited, carriers, options)
        if (built.selections?.length) inside.push(built)
        continue
      }
      if (take <= 0) continue
      inside.push(expand(child.id, child.definition, index, depth - 1, take, visited, carriers, options))
      // Only the discretionary part of this take comes out of what is left to
      // spread: `reserved` already accounted for the option's own minimum, and
      // charging it twice left a squad a body short of the size it must field.
      remaining -= share
    }
    const kept = withinOwnLimit(id, target, inside, index, options)
    return kept.length ? { id, count: 1, selections: kept } : { id, count: 1 }
  }

  const children: Selection[] = []
  // What this entry holds is held by `count` of it, which is what a per-model
  // requirement inside is counted against.
  const held = Math.max(1, count)
  for (const child of available) {
    const required = requiredCount(child.definition, index, options) * scaleOf(child.definition, index, held)
    if (resolve(child.definition, index).type === undefined) {
      // Always look inside a group. One with no minimum of its own can still hold
      // entries that insist on themselves — which is how most squads are written —
      // and skipping it leaves the unit with a sergeant and nobody to lead.
      const built = expand(child.id, child.definition, index, depth - 1, required, visited, held, options)
      if (built.selections?.length) children.push(built)
      continue
    }
    if (required <= 0) continue
    children.push(expand(child.id, child.definition, index, depth - 1, required, visited, held, options))
  }

  return children.length ? { id, count, selections: children } : { id, count }
}

/**
 * The placements a group's own limit still allows, once it holds them.
 *
 * A group can put its limit behind a modifier — "two weapons, unless you take the
 * twin, in which case one" — and that limit was read while the group was empty.
 * Taking the first option can settle the very question the limit was asking, so it
 * is asked again with the contents present and the placements it no longer allows
 * are let go of, least preferred first. Only groups whose limits move are asked twice.
 */
function withinOwnLimit(
  id: string,
  target: Definition,
  inside: readonly Selection[],
  index: CatalogueIndex,
  options: DefaultOptions,
): readonly Selection[] {
  if (inside.length < 2 || !hasDynamicSelectionLimit(target, index)) return inside
  const overfull = (candidate: readonly Selection[]) =>
    evaluate([{ id, count: 1, selections: [...candidate] }], index, options).errors.some(
      (error) => error.entryId === target.id && error.message.startsWith('allows at most '),
    )
  let kept = inside
  while (kept.length > 1 && overfull(kept)) kept = kept.slice(0, -1)
  return kept
}

/**
 * What a group offers, best first: the cheapest, then what the group names as its
 * default, then entries before nested groups.
 *
 * Cheapest first, because a mandatory choice has to be made for the player and
 * making it an expensive one puts points on a list nobody asked for — the floor of
 * a datasheet is what this is for. The catalogue's own default does not always
 * stand at that floor: an Achilles Ridgerunner names the heavy mining laser, which
 * the Munitorum prices as ten points of wargear over the base cost. So the named
 * default only settles a choice between options that cost the same.
 */
function ordered(group: Definition, options: Option[], index: CatalogueIndex): Option[] {
  const named = 'defaultSelectionEntryId' in group ? group.defaultSelectionEntryId : undefined
  return options.toSorted(
    (left, right) =>
      pointsOf(left, index) - pointsOf(right, index) ||
      Number(right.id === named) - Number(left.id === named) ||
      kindOf(left, index) - kindOf(right, index),
  )
}

const kindOf = (option: Option, index: CatalogueIndex) => (resolve(option.definition, index).type === undefined ? 1 : 0)

/**
 * Swaps a choice: whatever was taken is emptied and the new option takes its
 * place, so the group holds exactly what it is allowed to. The group need not be
 * in the tree yet — an optional one is not until something is put in it.
 */
export function withChoice(
  selection: Selection,
  key: string,
  optionId: string,
  index: CatalogueIndex,
  context: EvaluateOptions = {},
): Selection {
  const path = key.split('/')
  const groupId = path.at(-1)
  const group = groupId ? index.definitions.get(groupId) : undefined
  if (!group) return selection

  // A lone optional upgrade stands on its own, so its key names the entry itself
  // rather than a group holding it: the question is whether the unit has one, not
  // what to put inside it. Placing the option under that key would file the entry
  // inside a copy of itself and charge for it twice.
  if (resolve(group, index).type !== undefined) return withCounts(selection, [{ path, count: optionId ? 1 : 0 }])

  const occupants = childrenOf(resolve(group, index), index)
  const roster = [...(context.roster ?? []), selection]
  const options = new Set(
    occupants.filter((option) => requiredCount(option.definition, index, { ...context, roster }) === 0).map((option) => option.id),
  )
  const present = withPlaceFor(selection, path)
  if (!optionId) {
    return updateSelection(present, path, (held) => ({ ...held, selections: held.selections?.filter((child) => !options.has(child.id)) }))
  }

  const option = occupants.find((candidate) => candidate.id === optionId)
  if (!option || !options.has(option.id)) return present
  const required = Math.max(1, requiredCount(option.definition, index))
  const replacement = expand(option.id, option.definition, index, MAX_DEPTH, required, new Set(), 1)
  return updateSelection(present, path, (held) => ({
    ...held,
    selections: [...(held.selections ?? []).filter((child) => !options.has(child.id)), replacement],
  }))
}

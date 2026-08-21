/**
 * Reading and rewriting a selection tree by path.
 *
 * A selection is a unit as a list holds it: an id, how many, and what is inside. Every
 * edit a player makes reaches one node of that tree, named by the path of ids leading
 * to it, and comes back with a new tree rather than a changed one.
 *
 * Nothing here knows what a catalogue is. That is what keeps it safe to reach for from
 * anywhere else in the domain.
 */

import type { Selection } from './evaluate'

/** The node at `path`, or null when nothing has been put there yet. */
export function at(selection: Selection, path: readonly string[]): Selection | null {
  const [next, ...rest] = path
  if (next === undefined) return selection
  const child = (selection.selections ?? []).find((candidate) => candidate.id === next)
  return child ? at(child, rest) : null
}

/**
 * Every node at `path`, because one id can stand in a group more than once: two
 * veterans with a pyrecannon and two more with a heavy bolter are four selections of
 * the same entry.
 */
export function allAt(selection: Selection, path: readonly string[]): Selection[] {
  const [next, ...rest] = path
  if (next === undefined) return [selection]
  return (selection.selections ?? []).filter((candidate) => candidate.id === next).flatMap((child) => allAt(child, rest))
}

export function countAt(selection: Selection, path: readonly string[]): number {
  const [next, ...rest] = path
  if (next === undefined) return selection.count ?? 1
  const child = (selection.selections ?? []).find((candidate) => candidate.id === next)
  return child ? countAt(child, rest) : 0
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
  const index = children.findIndex((child) => child.id === next)
  const existing = children[index] ?? { id: next, count: 1 }
  const replaced = applyCount(existing, rest, count)
  if (index >= 0) children[index] = replaced
  else children.push(replaced)

  return { ...selection, selections: children }
}

/**
 * Sets how many of one option a group holds, leaving its siblings alone.
 *
 * This is the difference from `withChoice`, which empties the group first: a squad
 * splitting itself between two weapons wants both counts standing at once.
 */
export function withSpread(selection: Selection, key: string, counts: Readonly<Record<string, number>>): Selection {
  const path = key.split('/')
  return withCounts(
    selection,
    Object.entries(counts).map(([optionId, count]) => ({ path: [...path, optionId], count })),
  )
}

export function updateSelection(selection: Selection, path: readonly string[], update: (selection: Selection) => Selection): Selection {
  const [next, ...rest] = path
  if (next === undefined) return update(selection)
  return {
    ...selection,
    selections: (selection.selections ?? []).map((child) => (child.id === next ? updateSelection(child, rest, update) : child)),
  }
}

/** Every selection of `id` under `path` swapped for the ones given, in one pass. */
export function replaceAt(selection: Selection, path: readonly string[], id: string, replacements: readonly Selection[]): Selection {
  const [next, ...rest] = path
  if (next === undefined) {
    return { ...selection, selections: [...(selection.selections ?? []).filter((child) => child.id !== id), ...replacements] }
  }
  return {
    ...selection,
    selections: (selection.selections ?? []).map((child) => (child.id === next ? replaceAt(child, rest, id, replacements) : child)),
  }
}

export function withoutSelectionAt(selection: Selection, path: readonly string[]): Selection {
  const [next, ...rest] = path
  if (next === undefined) return selection
  if (!rest.length) return { ...selection, selections: selection.selections?.filter((child) => child.id !== next) }
  return {
    ...selection,
    selections: selection.selections?.map((child) => (child.id === next ? withoutSelectionAt(child, rest) : child)),
  }
}

/**
 * The tree with somewhere for `path` to be, so a request can reach a group that has
 * nothing in it yet.
 *
 * A group is absent until something is put in it — the heavy weapon a squad may take
 * is not in the tree while nobody carries one — and every walk above steps through
 * what is already there. Without a place made first, the request that would put the
 * first model in the group is the one request that goes nowhere.
 */
export function withPlaceFor(selection: Selection, path: readonly string[]): Selection {
  return at(selection, path) ? selection : withCounts(selection, [{ path, count: 1 }])
}

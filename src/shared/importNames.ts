import { normalized } from './importMismatch'
import type { VsDataNames } from './vsData'

/**
 * Every spelling the official app gives the names a list holds, in any of its languages, which an import reads a list
 * written in one of them by. Each list of spellings starts with the English one.
 */
export type ImportNames = {
  /** Each datasheet's spellings, by BSData entry id. */
  datasheets: ReadonlyMap<string, readonly string[]>
  /** The spellings of each model and piece of wargear a datasheet holds, by BSData entry id. */
  pieces: ReadonlyMap<string, readonly (readonly string[])[]>
  /** Each Detachment's spellings, by its English name normalized. */
  detachments: ReadonlyMap<string, readonly string[]>
}

export const NO_IMPORT_NAMES: ImportNames = { datasheets: new Map(), pieces: new Map(), detachments: new Map() }

/** Every group of spellings a release's names hold, each its English one first. */
export const spellingGroups = (names: VsDataNames | undefined): readonly (readonly string[])[] =>
  names
    ? [
        ...names.factions,
        ...names.detachments,
        ...names.enhancements,
        ...Object.values(names.units).flatMap((unit) => [...(unit.name.length ? [unit.name] : []), ...unit.pieces]),
      ]
    : []

/** A release's names, keyed by the BSData entry ids its units alias, as `entries` lists them under `unit:<id>`. */
export function importNamesOf(names: VsDataNames | undefined, entries: Readonly<Record<string, readonly string[]>>): ImportNames {
  if (!names) return NO_IMPORT_NAMES
  const datasheets = new Map<string, readonly string[]>()
  const pieces = new Map<string, readonly (readonly string[])[]>()
  for (const [unit, spelled] of Object.entries(names.units))
    for (const alias of entries[`unit:${unit}`] ?? []) {
      if (!alias.startsWith('bsdata.')) continue
      const entryId = alias.slice('bsdata.'.length).replaceAll('.', '-')
      if (spelled.name.length) datasheets.set(entryId, spelled.name)
      if (spelled.pieces.length) pieces.set(entryId, spelled.pieces)
    }
  const detachments = new Map<string, readonly string[]>()
  for (const spellings of names.detachments) {
    const key = normalized(spellings[0]!)
    detachments.set(key, [...new Set([...(detachments.get(key) ?? []), ...spellings])])
  }
  return { datasheets, pieces, detachments }
}

import type { VsDataNames } from './vsData'

/**
 * Every name a list can give what it holds, by the ID a saved roster stores: the official app's in any of its languages,
 * from VS Data, and BSData's own, which New Recruit prints. Each list of spellings starts with the English one.
 */
export type ImportNames = {
  /** Each datasheet's names from VS Data, by stored entry ID, or `<book>/<ID>` where it is another unit in that book. */
  datasheets: ReadonlyMap<string, readonly string[]>
  /** The spellings of each model and piece of wargear a datasheet holds, keyed as `datasheets`. */
  pieces: ReadonlyMap<string, readonly (readonly string[])[]>
  /** Each Detachment's names from VS Data, by stored ID, with BSData's names of every stored ID standing for that Detachment. */
  detachments: ReadonlyMap<string, readonly string[]>
  /** The names BSData gave each datasheet, by stored entry ID. */
  datasheetNames: ReadonlyMap<string, readonly string[]>
  /** The names BSData gave each Detachment, by stored ID. */
  detachmentNames: ReadonlyMap<string, readonly string[]>
  /** The names BSData gave each book, which New Recruit prints as a list's faction, by stored ID. */
  bookNames: ReadonlyMap<string, readonly string[]>
}

export const NO_IMPORT_NAMES: ImportNames = {
  datasheets: new Map(),
  pieces: new Map(),
  detachments: new Map(),
  datasheetNames: new Map(),
  detachmentNames: new Map(),
  bookNames: new Map(),
}

/** The names BSData gave a stored ID in the loaded rules version, which an earlier version keeps under its own key. */
export const storedNames = (names: ReadonlyMap<string, readonly string[]>, loaded: { edition?: { id: string } }, id: string) =>
  names.get(`${loaded.edition?.id}~${id}`) ?? names.get(id)

/**
 * The names BSData gave a stored ID, as frozen. Rules carrying none, as a download from an earlier release or a list read
 * without rules, read the catalogue's own names instead.
 */
export const frozenNames = (
  frozen: ReadonlyMap<string, readonly string[]>,
  loaded: { edition?: { id: string } },
  id: string,
  own: () => readonly string[],
) => (frozen.size ? (storedNames(frozen, loaded, id) ?? []) : own())

/**
 * The names BSData gave a book, as frozen, by its catalogue ID, which a rules version's book carries prefixed. Rules
 * carrying none, as a download from an earlier release or a list read without rules, read the catalogue's own names.
 */
export const frozenBookNames = (frozen: ReadonlyMap<string, readonly string[]>, catalogueId: string, own: () => readonly string[]) =>
  frozen.size ? (frozen.get(catalogueId) ?? frozen.get(catalogueId.slice(catalogueId.indexOf('~') + 1)) ?? []) : own()

/** Every group of spellings a release's names hold, each its English one first. */
export const spellingGroups = (names: VsDataNames | undefined): readonly (readonly string[])[] =>
  names
    ? [
        ...names.factions,
        ...Object.values(names.detachments),
        ...names.enhancements,
        ...names.dispositions,
        ...Object.values(names.units).flatMap((unit) => [unit.name, ...unit.pieces]),
      ]
    : []

/** The VS Data ID each stored ID stands for, and the names BSData gave each stored ID, both frozen. */
export type LegacyImportIds = {
  units: Readonly<Record<string, string>>
  detachments: Readonly<Record<string, string>>
  datasheetNames: ReadonlyMap<string, readonly string[]>
  detachmentNames: ReadonlyMap<string, readonly string[]>
  bookNames: ReadonlyMap<string, readonly string[]>
}

/** Each VS Data ID's stored IDs in one rules version, whose own `<rules version>~<ID>` keys stand for that ID there. */
const storedBy = (ids: Readonly<Record<string, string>>, rulesVersion: string | undefined) => {
  const stored = new Map<string, string[]>()
  for (const [key, current] of Object.entries(ids)) {
    const [version, id] = key.includes('~') ? key.split('~') : [undefined, key]
    if (version === rulesVersion || version === undefined) stored.set(current, [...(stored.get(current) ?? []), id])
  }
  return stored
}

/**
 * A release's names joined to the IDs saved rosters store in `rulesVersion`: a unit through the frozen map or its
 * `bsdata.*` aliases in `entries`, a Detachment through the frozen map, which also gives it BSData's names to be read by.
 */
export function importNamesOf(
  names: VsDataNames | undefined,
  entries: Readonly<Record<string, readonly string[]>>,
  legacy: LegacyImportIds,
  rulesVersion?: string,
): ImportNames {
  const datasheets = new Map<string, readonly string[]>()
  const pieces = new Map<string, readonly (readonly string[])[]>()
  const unitEntries = storedBy(legacy.units, rulesVersion)
  for (const [unit, spelled] of Object.entries(names?.units ?? {})) {
    const aliased = (entries[`unit:${unit}`] ?? []).flatMap((alias) =>
      alias.startsWith('bsdata.') ? [alias.slice('bsdata.'.length).replaceAll('.', '-')] : [],
    )
    for (const entryId of new Set([...(unitEntries.get(unit) ?? []), ...aliased])) {
      datasheets.set(entryId, spelled.name)
      if (spelled.pieces.length) pieces.set(entryId, spelled.pieces)
    }
  }
  const detachments = new Map<string, readonly string[]>()
  const detachmentEntries = storedBy(legacy.detachments, rulesVersion)
  for (const [detachment, spelled] of Object.entries(names?.detachments ?? {})) {
    const stored = detachmentEntries.get(detachment) ?? []
    const group = [...new Set([...spelled, ...stored.flatMap((id) => legacy.detachmentNames.get(id) ?? [])])]
    for (const id of stored) detachments.set(id, group)
  }
  return {
    datasheets,
    pieces,
    detachments,
    datasheetNames: legacy.datasheetNames,
    detachmentNames: legacy.detachmentNames,
    bookNames: legacy.bookNames,
  }
}

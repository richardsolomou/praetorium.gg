import { remember } from '../core/collections'
import { nameOf } from '../core/catalogue'
import type { LoadedCatalogue } from './catalogueIndex'
import { vsDataBook, vsDataChecks, vsDataWithoutDetachments } from './vsDataLegality'

/**
 * What a book's lists may take under its rules version's VS Data release, as the app has it. The catalogue still
 * decides every datasheet and Detachment VS Data cannot place, and holds what a saved or imported list names, so a list
 * keeps a unit or Detachment VS Data refuses.
 */
type VsDataOffer = {
  /** The book's datasheets VS Data refuses its lists: another faction's that no ally entry offers, or one it excludes. */
  refused: ReadonlySet<string>
  /** Each datasheet VS Data places, with the book an allied one is borrowed from, or null for the army's own. */
  allies: ReadonlyMap<string, string | null>
  /** The VS Data unit each datasheet VS Data checks is read as. */
  units: ReadonlyMap<string, string>
  /** The book's Detachments VS Data refuses its lists: another faction's, or one it excludes. */
  refusedDetachments: ReadonlySet<string>
}

const offers = new WeakMap<LoadedCatalogue, Map<string, VsDataOffer | null>>()

/** Null where VS Data cannot place the book's lists, which leaves them all to the catalogue. */
export function vsDataOffer(loaded: LoadedCatalogue, catalogueId: string): VsDataOffer | null {
  const byBook = remember(offers, loaded, () => new Map<string, VsDataOffer | null>())
  if (!byBook.has(catalogueId)) byBook.set(catalogueId, offerOf(loaded, catalogueId))
  return byBook.get(catalogueId)!
}

function offerOf(loaded: LoadedCatalogue, catalogueId: string): VsDataOffer | null {
  const data = loaded.vsRoster
  const placed = vsDataBook(data, catalogueId)
  if (!data || !placed) return null
  const { definitions, record, own } = placed
  const excluded = new Set(record.excludedUnits ?? [])
  const allied = new Set((record.allies ?? []).flatMap((ally) => ally.units))
  const refused = new Set<string>()
  const allies = new Map<string, string | null>()
  const units = new Map<string, string>()
  for (const entryId of loaded.index.datasheets.get(catalogueId) ?? []) {
    const entry = loaded.index.definitions.get(entryId)
    const id = entry && vsDataChecks(data, catalogueId, { entryId, name: nameOf(entry, loaded.index.definitions) })
    const faction = id ? definitions.get('unit', id)?.data.faction : undefined
    if (!id || !faction) continue
    units.set(entryId, id)
    const ownUnit = own.has(faction) && !excluded.has(id)
    if (!ownUnit && !allied.has(id)) refused.add(entryId)
    else allies.set(entryId, own.has(faction) ? null : bookOf(loaded, faction))
  }
  const excludedDetachments = new Set(record.excludedDetachments ?? [])
  const refusedDetachments = new Set(
    (loaded.detachments.get(catalogueId)?.options ?? []).flatMap((option) => {
      const id = data.detachments[option.id]
      const faction = id && definitions.get('detachment', id)?.data.faction
      // One VS Data has no record of stays the catalogue's.
      if (!id || !faction) return []
      return excludedDetachments.has(id) || !own.has(faction) ? [option.id] : []
    }),
  )
  return { refused, allies, units, refusedDetachments }
}

/** The name of the book whose lists are a VS Data faction's, which names an allied datasheet's source. */
function bookOf(loaded: LoadedCatalogue, faction: string) {
  const books = loaded.vsRoster?.books ?? {}
  const book = loaded.factions.find((candidate) => books[candidate.id.slice(candidate.id.indexOf('~') + 1)] === faction)
  return book?.name ?? loaded.vsRoster?.construction.definitions.faction?.[faction]?.name ?? faction
}

/**
 * The book an allied datasheet of a book's list is borrowed from, or undefined for one of its own: allied where VS Data
 * files it under another faction, and named as the catalogue names its source wherever the catalogue borrows it too.
 */
export function alliedSource(loaded: LoadedCatalogue, catalogueId: string, entryId: string) {
  const catalogue = loaded.index.alliedDatasheets.get(catalogueId)?.get(entryId)?.name
  const placed = vsDataOffer(loaded, catalogueId)?.allies
  if (!placed?.has(entryId)) return catalogue
  const source = placed.get(entryId)
  return source === null ? undefined : (catalogue ?? source)
}

/**
 * The Detachments a book's lists may take: the catalogue's, but those VS Data refuses them, and none for a Titan army,
 * even one whose book VS Data cannot otherwise place, as Titanicus Traitoris's.
 */
export function offeredDetachments(loaded: LoadedCatalogue, catalogueId: string) {
  if (vsDataWithoutDetachments(loaded.vsRoster, catalogueId)) return []
  const refused = vsDataOffer(loaded, catalogueId)?.refusedDetachments
  return (loaded.detachments.get(catalogueId)?.options ?? []).filter((option) => !refused?.has(option.id))
}

/**
 * The book's datasheets VS Data refuses a list of it holding `detachmentIds`: those it refuses the book, and those one of
 * the list's Detachments excludes, as Shadow Legion excludes a Daemon Prince.
 */
export function vsDataRefused(loaded: LoadedCatalogue, catalogueId: string, detachmentIds: readonly string[]): ReadonlySet<string> {
  const offer = vsDataOffer(loaded, catalogueId)
  const data = loaded.vsRoster
  if (!offer || !data) return new Set()
  const definitions = vsDataBook(data, catalogueId)!.definitions
  const excluded = new Set(
    detachmentIds.flatMap((id) => {
      const vs = data.detachments[id]
      return (vs && definitions.get('detachment', vs)?.data.excludedUnits) || []
    }),
  )
  if (!excluded.size) return offer.refused
  return new Set([...offer.refused, ...[...offer.units].flatMap(([entryId, unit]) => (excluded.has(unit) ? [entryId] : []))])
}

/**
 * The list's units VS Data refuses its book or one of its Detachments, in the words VS Data's checker gives, for a list
 * that checker cannot check whole.
 */
export function vsDataRefusedUnits(
  loaded: LoadedCatalogue,
  list: { catalogueId: string; detachmentIds: readonly string[] },
  units: readonly { entryId: string; name: string }[],
) {
  const refused = vsDataRefused(loaded, list.catalogueId, list.detachmentIds)
  return units.flatMap((unit) =>
    refused.has(unit.entryId) ? [{ entryId: unit.entryId, entryName: unit.name, message: 'cannot be taken by this army' }] : [],
  )
}

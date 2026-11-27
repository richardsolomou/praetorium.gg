import { remember } from '../core/collections'
import { nameOf } from '../core/catalogue'
import type { LoadedCatalogue } from './catalogueIndex'
import { vsDataBook, vsDataChecks } from './vsDataLegality'

/**
 * What a book's lists may take under its rules version's VS Data release, as the app has it. The catalogue still
 * decides every datasheet and Detachment VS Data cannot place, and holds what a saved or imported list names, so a list
 * keeps a unit or Detachment VS Data refuses and is told why.
 */
type VsDataOffer = {
  /** The book's datasheets VS Data refuses its lists: another faction's that no ally entry offers, or one it excludes. */
  refused: ReadonlySet<string>
  /** Each datasheet VS Data places, with the book an allied one is borrowed from, or null for the army's own. */
  allies: ReadonlyMap<string, string | null>
  /** The book's Detachments VS Data refuses its lists: another faction's, one it excludes, or any for a Titan army. */
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
  const { definitions, record, own, without } = placed
  const excluded = new Set(record.excludedUnits ?? [])
  const allied = new Set((record.allies ?? []).flatMap((ally) => ally.units))
  const refused = new Set<string>()
  const allies = new Map<string, string | null>()
  for (const entryId of loaded.index.datasheets.get(catalogueId) ?? []) {
    const entry = loaded.index.definitions.get(entryId)
    const id = entry && vsDataChecks(data, catalogueId, { entryId, name: nameOf(entry, loaded.index.definitions) })
    const faction = id ? definitions.get('unit', id)?.data.faction : undefined
    if (!id || !faction) continue
    const ownUnit = own.has(faction) && !excluded.has(id)
    if (!ownUnit && !allied.has(id)) refused.add(entryId)
    else allies.set(entryId, own.has(faction) ? null : bookOf(loaded, faction))
  }
  const excludedDetachments = new Set(record.excludedDetachments ?? [])
  const refusedDetachments = new Set(
    (loaded.detachments.get(catalogueId)?.options ?? []).flatMap((option) => {
      const id = data.detachments[option.id]
      const faction = id && definitions.get('detachment', id)?.data.faction
      // A Titan army refuses any Detachment, VS Data's or not; one VS Data has no record of stays the catalogue's.
      if (!id || !faction) return without ? [option.id] : []
      return without || excludedDetachments.has(id) || !own.has(faction) ? [option.id] : []
    }),
  )
  return { refused, allies, refusedDetachments }
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

/** The Detachments a book's lists may take: the catalogue's, but those VS Data refuses them. */
export function offeredDetachments(loaded: LoadedCatalogue, catalogueId: string) {
  const refused = vsDataOffer(loaded, catalogueId)?.refusedDetachments
  return (loaded.detachments.get(catalogueId)?.options ?? []).filter((option) => !refused?.has(option.id))
}

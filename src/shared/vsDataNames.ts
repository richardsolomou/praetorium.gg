import rawBooks from '../../catalogue/legacy-ids/books.json' with { type: 'json' }
import { nameOf } from '../core/catalogue'
import { remember } from '../core/collections'
import { legacyIdsSchema } from '../core/legacyIds'
import type { LoadedCatalogue } from './catalogueIndex'
import { normalized } from './importMismatch'
import { withoutUpgrade } from './mfm'
import { vsDefinitionsOf } from './vsDataBuild'
import { datasheetOf, idsIn, inBook } from './vsDataPoints'

// The English names VS Data gives what a list stores, the official app's, by the IDs the list holds read through the
// rules version's frozen maps; each is undefined where VS Data has no record for the ID.

const books = legacyIdsSchema.parse(rawBooks).ids

const editionOf = (catalogueId: string) => (catalogueId.includes('~') ? catalogueId.slice(0, catalogueId.indexOf('~')) : null)
const bookOf = (catalogueId: string) => catalogueId.slice(catalogueId.indexOf('~') + 1)

/**
 * The VS Data faction a book is, where no other book of its rules version is that faction too: an earlier rules version
 * files every Space Marine chapter under one, which would name a chapter's list by the whole army.
 */
function soleVsFaction(loaded: LoadedCatalogue, catalogueId: string) {
  const books = loaded.vsRoster?.books
  const id = books?.[bookOf(catalogueId)]
  return id && loaded.factions.filter((faction) => books[bookOf(faction.id)] === id).length <= 1 ? id : undefined
}

export function vsFactionName(loaded: LoadedCatalogue, catalogueId: string) {
  const id = soleVsFaction(loaded, catalogueId)
  return id ? vsDefinitionsOf(loaded)?.get('faction', id)?.name : undefined
}

const sharedNamesOf = new WeakMap<LoadedCatalogue, ReadonlySet<string>>()

/**
 * The VS Data unit names that differently named datasheets read as: one Soul Grinder for BSData's four god-named ones, or
 * a Legends datasheet VS Data names as the current one.
 */
const sharedNames = (loaded: LoadedCatalogue) =>
  remember(sharedNamesOf, loaded, () => {
    const definitions = vsDefinitionsOf(loaded)
    const datasheets = new Map<string, Set<string>>()
    for (const [key, unit] of Object.entries(loaded.vsRoster?.units ?? {})) {
      const definition = loaded.index.definitions.get(datasheetOf(key))
      const name = unit ? definitions?.get('unit', unit)?.name : undefined
      if (name && definition)
        datasheets.set(normalized(name), (datasheets.get(normalized(name)) ?? new Set()).add(nameOf(definition, loaded.index.definitions)))
    }
    return new Set([...datasheets].flatMap(([name, named]) => (named.size > 1 ? [name] : [])))
  })

/** A datasheet's name from VS Data, where it names that datasheet alone; one it shares would read back as another. */
export function vsDatasheetName(loaded: LoadedCatalogue, catalogueId: string, entryId: string) {
  const id = inBook(loaded.vsRoster?.units, catalogueId, entryId)
  const name = id ? vsDefinitionsOf(loaded)?.get('unit', id)?.name : undefined
  return name && !sharedNames(loaded).has(normalized(name)) ? name : undefined
}

/** A datasheet's English name: VS Data's, else the catalogue's. */
export function datasheetName(loaded: LoadedCatalogue, catalogueId: string, entryId: string) {
  const definition = loaded.index.definitions.get(entryId)
  return vsDatasheetName(loaded, catalogueId, entryId) ?? (definition ? nameOf(definition, loaded.index.definitions) : undefined)
}

export function vsDetachmentName(loaded: LoadedCatalogue, detachmentId: string) {
  const id = loaded.vsRoster?.detachments[detachmentId]
  return id ? vsDefinitionsOf(loaded)?.get('detachment', id)?.name : undefined
}

/** An Enhancement as VS Data writes `name`, where the two are one spelling but for case, quotes and dashes, as wargear is named. */
export function vsEnhancementName(loaded: LoadedCatalogue, enhancementId: string, name: string) {
  const own = vsDefinitionsOf(loaded)?.get('enhancement', enhancementId)?.name
  return own && normalized(withoutUpgrade(own)) === normalized(withoutUpgrade(name)) ? own : undefined
}

/**
 * Names a datasheet's wargear as VS Data writes it on the datasheet's unit where the two are one spelling but for case,
 * quotes and dashes; any other spelling keeps the name it was given, since imports do not yet read every app spelling back.
 */
export function vsWargearNames(loaded: LoadedCatalogue, catalogueId: string, entryId: string): (name: string) => string {
  const definitions = vsDefinitionsOf(loaded)
  const unit = inBook(loaded.vsRoster?.units, catalogueId, entryId)
  if (!definitions || !unit) return (name) => name
  const ids = new Set([
    ...definitions.modelsOf(unit).flatMap((model) => Object.keys(model.data.wargear)),
    ...definitions.optionsOf(unit).flatMap((option) => [...option.data.choices, ...Object.keys(option.data.replaces ?? {})]),
  ])
  for (const id of ids) for (const held of Object.keys(definitions.get('wargear', id)?.data.includes ?? {})) ids.add(held)
  const byKey = new Map<string, string>()
  for (const id of ids) {
    const name = definitions.get('wargear', id)?.name
    if (name && !byKey.has(normalized(name))) byKey.set(normalized(name), name)
  }
  return (name) => byKey.get(normalized(name)) ?? name
}

/** The ruleset an export names: the list's VS Data faction where it is that book alone, under its rules version where that is not the base one; else the book's ID. */
export function exportRuleset(loaded: LoadedCatalogue, catalogueId: string) {
  const faction = soleVsFaction(loaded, catalogueId)
  if (!faction) return catalogueId
  const edition = editionOf(catalogueId)
  return edition ? `${edition}~${faction}` : faction
}

/** The stored book IDs a ruleset can name: itself, then each book the frozen map files under it as a VS Data faction. */
export function rulesetCatalogueIds(ruleset: string) {
  const edition = editionOf(ruleset)
  const faction = bookOf(ruleset)
  const filed = [...idsIn(books, edition)].flatMap(([book, id]) => (id === faction ? [edition ? `${edition}~${book}` : book] : []))
  return [ruleset, ...filed]
}

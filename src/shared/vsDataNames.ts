import rawBooks from '../../catalogue/legacy-ids/books.json' with { type: 'json' }
import { nameOf } from '../core/catalogue'
import { legacyIdsSchema } from '../core/legacyIds'
import { wargearKey } from '../core/wargearNames'
import type { LoadedCatalogue } from './catalogueIndex'
import { vsDefinitionsOf } from './vsDataBuild'
import { idsIn, inBook } from './vsDataPoints'
import { vsSpelling } from './wargearSpellings'

// The English names VS Data gives what a list stores, the official app's, by the IDs the list holds read through the
// rules version's frozen maps; each is undefined where VS Data has no record for the ID.

const books = legacyIdsSchema.parse(rawBooks).ids

const editionOf = (catalogueId: string) => (catalogueId.includes('~') ? catalogueId.slice(0, catalogueId.indexOf('~')) : null)
const bookOf = (catalogueId: string) => catalogueId.slice(catalogueId.indexOf('~') + 1)

export function vsFactionName(loaded: LoadedCatalogue, catalogueId: string) {
  const id = loaded.vsRoster?.books[bookOf(catalogueId)]
  return id ? vsDefinitionsOf(loaded)?.get('faction', id)?.name : undefined
}

export function vsDatasheetName(loaded: LoadedCatalogue, catalogueId: string, entryId: string) {
  const id = inBook(loaded.vsRoster?.units, catalogueId, entryId)
  return id ? vsDefinitionsOf(loaded)?.get('unit', id)?.name : undefined
}

/** A datasheet's English name: VS Data's, else the catalogue's, else its ID. */
export function datasheetName(loaded: LoadedCatalogue, catalogueId: string, entryId: string) {
  const definition = loaded.index.definitions.get(entryId)
  return vsDatasheetName(loaded, catalogueId, entryId) ?? (definition ? nameOf(definition, loaded.index.definitions) : entryId)
}

export function vsDetachmentName(loaded: LoadedCatalogue, detachmentId: string) {
  const id = loaded.vsRoster?.detachments[detachmentId]
  return id ? vsDefinitionsOf(loaded)?.get('detachment', id)?.name : undefined
}

export const vsEnhancementName = (loaded: LoadedCatalogue, enhancementId: string) =>
  vsDefinitionsOf(loaded)?.get('enhancement', enhancementId)?.name

/**
 * Names a datasheet's wargear as VS Data names it on the datasheet's unit, matched through the reviewed spellings; a
 * piece the unit's VS Data wargear does not hold keeps the name it was given.
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
    if (name && !byKey.has(wargearKey(name))) byKey.set(wargearKey(name), name)
  }
  const keys = new Set(byKey.keys())
  return (name) => byKey.get(vsSpelling(name, keys)) ?? name
}

/** The ruleset an export names: the list's VS Data faction, under its rules version where that is not the base one. */
export function exportRuleset(loaded: LoadedCatalogue, catalogueId: string) {
  const faction = loaded.vsRoster?.books[bookOf(catalogueId)]
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

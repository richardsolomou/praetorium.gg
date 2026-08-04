import fs from 'node:fs'
import path from 'node:path'
import { buildIndex, type CatalogueFile, type CatalogueIndex } from '../core/catalogue'

/**
 * The community catalogue data, if this instance has any.
 *
 * Loaded once, on the first request that needs it rather than at boot: an
 * instance whose operator has not run `catalogue:sync` should still start, serve
 * battles, and simply not offer list building. The whole set is about 90MB of
 * heap, which is why it is held in the process rather than compiled down.
 */
export function catalogueDirectory(dataDirectory = process.env.DATA_DIR ?? '/data') {
  return process.env.CATALOGUE_DIR ?? path.join(path.resolve(dataDirectory), 'catalogue')
}

export type LoadedCatalogue = { index: CatalogueIndex; factions: { id: string; name: string }[] }

/** Libraries hold shared entries for other books and are never picked directly. */
const LIBRARY_SUFFIX = ' Library'

export function loadCatalogue(directory = catalogueDirectory()): LoadedCatalogue | null {
  const definitions = path.join(directory, 'definitions')
  const revisionFile = path.join(directory, 'revision.json')
  if (!fs.existsSync(definitions) || !fs.existsSync(revisionFile)) return null

  const revision: { definitions?: string } = JSON.parse(fs.readFileSync(revisionFile, 'utf8'))
  if (!revision.definitions) return null

  const files: CatalogueFile[] = fs
    .readdirSync(definitions)
    .filter((name) => name.endsWith('.json'))
    .map((name): CatalogueFile => JSON.parse(fs.readFileSync(path.join(definitions, name), 'utf8')))
  if (!files.length) return null

  const index = buildIndex(files, revision.definitions)
  const factions = [...index.catalogues.values()]
    .filter((catalogue) => !catalogue.name.endsWith(LIBRARY_SUFFIX) && unitCount(index, catalogue.id) > 0)
    .map((catalogue) => ({ id: catalogue.id, name: catalogue.name }))
    .toSorted((left, right) => left.name.localeCompare(right.name))

  return { index, factions }
}

function unitCount(index: CatalogueIndex, catalogueId: string) {
  let found = 0
  for (const entries of index.unitsByName.values()) {
    for (const entry of entries) {
      if (index.catalogueOf.get(entry.id) === catalogueId) found++
    }
  }
  return found
}

export type UnitSummary = { id: string; name: string; points: number | null }

/**
 * The pickable datasheets in a book, with the price of the smallest legal version
 * of each. Points are derived here and never stored: the data revision is what a
 * roster pins, and the number follows from it.
 */
export function unitsIn(loaded: LoadedCatalogue, catalogueId: string, query: string, limit = 60): UnitSummary[] {
  const wanted = query.trim().toLowerCase()
  const found: UnitSummary[] = []

  for (const entries of loaded.index.unitsByName.values()) {
    for (const entry of entries) {
      if (loaded.index.catalogueOf.get(entry.id) !== catalogueId) continue
      if (entry.hidden || entry.type !== 'unit') continue
      if (!entry.name || (wanted && !entry.name.toLowerCase().includes(wanted))) continue
      found.push({ id: entry.id, name: entry.name, points: null })
    }
  }

  return found.toSorted((left, right) => left.name.localeCompare(right.name)).slice(0, limit)
}

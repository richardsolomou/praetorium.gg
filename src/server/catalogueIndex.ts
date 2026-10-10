import { createHash } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { buildIndex, type CatalogueFile } from '../core/catalogue'
import { loadDatacards } from './datacards'
import { catalogueSections } from './catalogueSections'
import { loadMfm } from './mfm'
import { type LoadedCatalogue, catalogueFromIndex } from '../shared/catalogueIndex'
export * from '../shared/catalogueIndex'
export function catalogueDirectory(dataDirectory = process.env.DATA_DIR ?? '/data') {
  return process.env.CATALOGUE_DIR ?? path.join(path.resolve(dataDirectory), 'catalogue')
}
export function loadCatalogue(directory = catalogueDirectory()): LoadedCatalogue | null {
  const definitions = path.join(directory, 'definitions')
  const revisionFile = path.join(directory, 'revision.json')
  if (!fs.existsSync(definitions) || !fs.existsSync(revisionFile)) return null

  const revision: Record<string, string> = JSON.parse(fs.readFileSync(revisionFile, 'utf8'))
  if (!revision.definitions) return null

  const files = fs
    .readdirSync(definitions)
    .filter((name) => name.endsWith('.json'))
    .map((name): CatalogueFile => JSON.parse(fs.readFileSync(path.join(definitions, name), 'utf8')))
  if (!files.length) return null

  const index = buildIndex(files, catalogueRevision(revision))
  // The cards name sections they do not describe, and the catalogue is where those words are.
  const datacards = loadDatacards(path.join(directory, 'datacards', '11th', 'gdc'), catalogueSections(index))
  return { ...catalogueFromIndex(index, files, datacards), mfm: loadMfm(directory) }
}
export function catalogueRevision(revisions: Record<string, string>) {
  return createHash('sha256')
    .update(JSON.stringify(Object.entries(revisions).sort(([left], [right]) => left.localeCompare(right))))
    .digest('hex')
}

import { hash } from 'node:crypto'
import { publishedTexts } from './sourceTexts'
import fs from 'node:fs'
import path from 'node:path'
import { buildIndex, type CatalogueFile } from '../core/catalogue'
import { editionCatalogueFiles, type CatalogueEdition } from '../core/catalogueEdition'
import { catalogueReferencePolicySchema, datacardExclusions } from '../core/catalogueReferencePolicy'
import { loadDatacardsSteps } from './datacards'
import { catalogueSections } from './catalogueSections'
import { loadMfmSteps } from './mfm'
import { readSharedJson } from './sharedJson'
import { type LoadedCatalogue, catalogueFromIndex } from '../shared/catalogueIndex'
import { completeSteps, type Steps } from '../shared/steps'
import { liveCatalogueRevision } from './liveCatalogue'
import { readRevisions } from './catalogueSources'
export * from '../shared/catalogueIndex'
export function catalogueDirectory(dataDirectory = process.env.DATA_DIR ?? '/data') {
  const live = liveCatalogueRevision()
  return live ? path.join(live.directory, 'catalogue') : (process.env.CATALOGUE_DIR ?? path.join(path.resolve(dataDirectory), 'catalogue'))
}
export function loadCatalogue(directory = catalogueDirectory(), edition?: CatalogueEdition): LoadedCatalogue | null {
  return completeSteps(loadCatalogueSteps(directory, edition))
}

export function* loadCatalogueSteps(directory = catalogueDirectory(), edition?: CatalogueEdition): Steps<LoadedCatalogue | null> {
  const definitions = path.join(directory, 'definitions')
  const revisionFile = path.join(directory, 'revision.json')
  if (!fs.existsSync(definitions) || !fs.existsSync(revisionFile)) return null

  const revision = readRevisions(directory)
  if (!revision.definitions) return null

  const strings = new Map<string, string>()
  const files: CatalogueFile[] = []
  const paths = new Map<CatalogueFile, string>()
  for (const name of fs.readdirSync(definitions).filter((entry) => entry.endsWith('.json'))) {
    const file = readSharedJson(path.join(definitions, name), strings) as CatalogueFile
    files.push(file)
    paths.set(file, path.join(definitions, name))
    yield
  }
  if (!files.length) return null

  const selectedFiles = edition ? editionCatalogueFiles(files, edition) : files
  yield
  const index = buildIndex(selectedFiles, catalogueRevision({ ...revision, ...(edition ? { edition: edition.id } : {}) }))
  yield
  // The cards name sections they do not describe, and the catalogue is where those words are.
  const datacards = yield* loadDatacardsSteps(path.join(directory, 'datacards', '11th', 'gdc'), catalogueSections(index), strings)
  const policyFile = path.join(directory, 'reference-policy.json')
  const policy = fs.existsSync(policyFile) ? catalogueReferencePolicySchema.parse(JSON.parse(fs.readFileSync(policyFile, 'utf8'))) : null
  const loaded = catalogueFromIndex(index, selectedFiles, datacards)
  yield
  return {
    ...loaded,
    definitionTexts: definitionTexts(paths),
    ...(policy ? { datacardExcludedCatalogueIds: datacardExclusions(policy.datacardExcludedCatalogueIds, edition) } : {}),
    mfm: yield* loadMfmSteps(directory),
    ...(edition ? { edition } : {}),
  }
}
export function catalogueRevision(revisions: Record<string, string>) {
  return hash('sha256', JSON.stringify(Object.entries(revisions).sort(([left], [right]) => left.localeCompare(right))))
}

/**
 * Each BSData rules text — a profile's characteristic or a rule's description — by its words,
 * published as a token naming the file that states it. Built when first asked: only what
 * the server publishes reads it.
 */
function definitionTexts(paths: ReadonlyMap<CatalogueFile, string>) {
  let tokens: Map<string, string> | undefined
  return (raw: string) => {
    if (!tokens) {
      tokens = new Map()
      for (const [file, location] of paths) {
        const texts = publishedTexts(location)
        const visit = (value: unknown, key?: string) => {
          if (typeof value === 'string') {
            if ((key === '$text' || key === 'description') && value.trim() && !tokens!.has(value)) tokens!.set(value, texts(value, 'plain'))
          } else if (Array.isArray(value)) for (const entry of value) visit(entry)
          else if (value && typeof value === 'object') for (const [field, entry] of Object.entries(value)) visit(entry, field)
        }
        visit(file)
      }
    }
    return tokens.get(raw) ?? null
  }
}

import { createHash } from 'node:crypto'
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
export * from '../shared/catalogueIndex'
export function catalogueDirectory(dataDirectory = process.env.DATA_DIR ?? '/data') {
  return process.env.CATALOGUE_DIR ?? path.join(path.resolve(dataDirectory), 'catalogue')
}
export function loadCatalogue(directory = catalogueDirectory(), edition?: CatalogueEdition): LoadedCatalogue | null {
  return completeSteps(loadCatalogueSteps(directory, edition))
}

export function* loadCatalogueSteps(directory = catalogueDirectory(), edition?: CatalogueEdition): Steps<LoadedCatalogue | null> {
  const definitions = path.join(directory, 'definitions')
  const revisionFile = path.join(directory, 'revision.json')
  if (!fs.existsSync(definitions) || !fs.existsSync(revisionFile)) return null

  const revision: Record<string, string> = JSON.parse(fs.readFileSync(revisionFile, 'utf8'))
  if (!revision.definitions) return null

  const strings = new Map<string, string>()
  const files: CatalogueFile[] = []
  for (const name of fs.readdirSync(definitions).filter((entry) => entry.endsWith('.json'))) {
    files.push(readSharedJson(path.join(definitions, name), strings) as CatalogueFile)
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
    ...(policy ? { datacardExcludedCatalogueIds: datacardExclusions(policy.datacardExcludedCatalogueIds, edition) } : {}),
    mfm: yield* loadMfmSteps(directory),
    ...(edition ? { edition } : {}),
  }
}
export function catalogueRevision(revisions: Record<string, string>) {
  return createHash('sha256')
    .update(JSON.stringify(Object.entries(revisions).sort(([left], [right]) => left.localeCompare(right))))
    .digest('hex')
}

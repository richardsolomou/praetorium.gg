import path from 'node:path'

const root = path.join(import.meta.dirname, '..', '..')

export function canonicalCatalogueInputDirectory() {
  return process.env.CATALOGUE_DIR ?? path.join(root, 'catalogue-data')
}

export function canonicalCatalogueOutputFile() {
  return process.env.CATALOGUE_CANONICAL_FILE ?? path.join(root, '.output', 'canonical-catalogue.json')
}

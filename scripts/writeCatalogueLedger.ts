import path from 'node:path'
import { readCanonicalCatalogue } from '../src/server/canonicalCatalogue'
import { canonicalCatalogueOutputFile } from './canonicalCatalogueFiles'
import { writeCatalogueLedger } from './catalogueLedger'

const directory = process.env.CATALOGUE_LEDGER_DIR?.trim()
if (!directory) throw new Error('CATALOGUE_LEDGER_DIR is required')
const repository = process.env.CATALOGUE_COMPILER_REPOSITORY?.trim()
const commit = process.env.CATALOGUE_COMPILER_COMMIT?.trim()
if (Boolean(repository) !== Boolean(commit)) {
  throw new Error('CATALOGUE_COMPILER_REPOSITORY and CATALOGUE_COMPILER_COMMIT must be set together')
}

const summary = writeCatalogueLedger(
  readCanonicalCatalogue(canonicalCatalogueOutputFile()),
  path.resolve(directory),
  repository && commit ? { repository, commit } : undefined,
)
console.log(`catalogue ledger: ${summary.datasheets} datasheets, ${summary.ruleDocuments} rule documents, ${summary.issues} audit issues`)

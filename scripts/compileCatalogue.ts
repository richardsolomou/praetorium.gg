import { writeCanonicalCatalogue } from '../src/server/canonicalCatalogue'
import { catalogueDataDirectory, canonicalCatalogueOutputFile } from './lib/catalogueFiles'

const catalogue = writeCanonicalCatalogue(catalogueDataDirectory(), canonicalCatalogueOutputFile())
console.log(`canonical datasheets: ${catalogue.datasheets.length}`)
console.log(`canonical rule documents: ${catalogue.ruleDocuments.length}`)
console.log(`canonical audit issues: ${catalogue.issues.length}`)

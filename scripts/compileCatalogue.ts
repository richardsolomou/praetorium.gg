import { writeCanonicalCatalogue } from '../src/server/canonicalCatalogue'
import { canonicalCatalogueInputDirectory, canonicalCatalogueOutputFile } from './lib/canonicalCatalogueFiles'

const catalogue = writeCanonicalCatalogue(canonicalCatalogueInputDirectory(), canonicalCatalogueOutputFile())
console.log(`canonical datasheets: ${catalogue.datasheets.length}`)
console.log(`canonical rule documents: ${catalogue.ruleDocuments.length}`)
console.log(`canonical audit issues: ${catalogue.issues.length}`)

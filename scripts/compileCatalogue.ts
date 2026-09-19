import { writeCanonicalCatalogue } from '../src/server/canonicalCatalogue'
import { catalogueDirectory } from '../src/server/catalogueIndex'

const catalogue = writeCanonicalCatalogue(catalogueDirectory(), process.env.CATALOGUE_CANONICAL_FILE)
console.log(`canonical datasheets: ${catalogue.datasheets.length}`)
console.log(`canonical rule documents: ${catalogue.ruleDocuments.length}`)
console.log(`canonical audit issues: ${catalogue.issues.length}`)

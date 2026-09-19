import { canonicalCataloguePath, readCanonicalCatalogue } from '../src/server/canonicalCatalogue'
import { catalogueDirectory } from '../src/server/catalogueIndex'

process.stdout.on('error', (error: NodeJS.ErrnoException) => {
  if (error.code === 'EPIPE') process.exit(0)
  throw error
})

const directory = catalogueDirectory()
const catalogue = readCanonicalCatalogue(process.env.CATALOGUE_CANONICAL_FILE ?? canonicalCataloguePath(directory))
const counts = new Map<string, number>()
for (const issue of catalogue.issues) counts.set(issue.kind, (counts.get(issue.kind) ?? 0) + 1)
for (const [kind, count] of [...counts].toSorted(([left], [right]) => left.localeCompare(right))) {
  console.log(`${kind}: ${count}`)
}
if (process.argv.includes('--details')) {
  for (const issue of catalogue.issues) {
    console.log(`${issue.severity} | ${issue.kind} | ${issue.catalogueId}:${issue.entryId}${issue.path} | ${issue.message}`)
  }
}

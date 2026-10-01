import fs from 'node:fs'
import path from 'node:path'
import { compareProfiles, compareSheetIdentities, profileChangesOutside } from './lib/profileProjectionComparison'
import { loadCatalogue } from '../src/server/catalogueIndex'
import { editionlessCatalogueName } from '../src/server/factionNames'

const [beforeFile, afterFile] = process.argv.slice(2)
const replacementAt = process.argv.indexOf('--replacement')
const replacementName = replacementAt < 0 ? undefined : process.argv[replacementAt + 1]
if (!beforeFile || !afterFile || !replacementName)
  throw new Error('usage: compareProjectedProfiles.ts <before.json> <after.json> --replacement <catalogue name>')

const before = JSON.parse(fs.readFileSync(beforeFile, 'utf8'))
const after = JSON.parse(fs.readFileSync(afterFile, 'utf8'))
const sources = new Set([...Object.keys(before.revisions), ...Object.keys(after.revisions)])
if ([...sources].some((source) => before.revisions[source] !== after.revisions[source])) {
  throw new Error('profile projections must use the same source revisions')
}
const loaded = loadCatalogue(process.env.CATALOGUE_DIR ?? path.join(import.meta.dirname, '..', 'catalogue-data'))
if (!loaded) throw new Error('catalogue data is unavailable')
const books = [...loaded.index.catalogues.values()]
const replacement = books.find((book) => book.name === replacementName && loaded.profiledCatalogueIds.has(book.id))
const familyPrefix = `${editionlessCatalogueName(replacementName).split(' - ').slice(0, -1).join(' - ')} - `
const family = replacement ? books.filter((book) => book.name.startsWith(familyPrefix)) : []
const chapters = new Set(family.filter((book) => loaded.profiledSupplementIds.has(book.id)).map((book) => book.name.split(' - ').at(-1)))
const allowed = new Set([
  ...family.map((book) => book.id),
  ...books
    .filter((book) => loaded.profiledCatalogueIds.has(book.id) && chapters.has(editionlessCatalogueName(book.name).split(' - ').at(-1)))
    .map((book) => book.id),
])
const changes = compareProfiles(before, after)
const unexpected = profileChangesOutside(changes, allowed)
const identities = compareSheetIdentities(before, after)
const unexpectedIdentities = identities.filter((change) => !allowed.has(change.catalogueId))

console.log(
  `profile values changed: ${changes.length}; datasheet identities changed: ${identities.length} (${unexpected.length + unexpectedIdentities.length} outside the ${replacementName} family)`,
)
if (!replacement) console.log(`replacement book absent from this snapshot: ${replacementName}`)
for (const change of identities) {
  console.log(`${allowed.has(change.catalogueId) ? '' : 'UNEXPECTED '}${change.faction} / ${change.datasheet}: ${change.kind}`)
}
for (const change of changes) {
  console.log(
    `${allowed.has(change.catalogueId) ? '' : 'UNEXPECTED '}${change.faction} / ${change.datasheet} / ${change.profile} / ${change.characteristic}: ${change.before ?? '∅'} → ${change.after ?? '∅'}`,
  )
}
if (unexpected.length || unexpectedIdentities.length) process.exitCode = 1

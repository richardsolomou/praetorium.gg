import path from 'node:path'
import { catalogueSources, SNAPSHOT_SOURCE_NAMES } from '../src/server/catalogueSources'
import { readCatalogueComposition } from '../src/server/catalogueComposition'
import { materializeCatalogue } from './lib/catalogueMaterialize'
import { loadCatalogueCredentials } from './lib/catalogueCredentials'

const stored = '--without-stored-editions'
// Retired editions pinned to a published snapshot only come from the private store, so a build without its credentials leaves them out.
const withoutStored = process.argv.includes(stored)
const args = process.argv.slice(2).filter((arg) => arg !== stored)
const source = args[0] === '--source' ? args[1] : undefined
if (
  args.length !== (source ? 2 : 0) ||
  (source !== undefined && !SNAPSHOT_SOURCE_NAMES.includes(source as (typeof SNAPSHOT_SOURCE_NAMES)[number]))
) {
  throw new Error(`expected no argument or --source ${SNAPSHOT_SOURCE_NAMES.join('|')}, optionally with ${stored}`)
}
const composition = readCatalogueComposition(path.resolve('catalogue'))
if (!withoutStored && !source && composition?.editions.some((edition) => edition.snapshot)) loadCatalogueCredentials(path.resolve('.'))
const directory = process.env.CATALOGUE_DIR ?? path.resolve('.output', ...(source ? ['catalogue-sources', source] : ['catalogue-data']))
await materializeCatalogue(directory, catalogueSources, {
  source: source as (typeof SNAPSHOT_SOURCE_NAMES)[number] | undefined,
  report: console.log,
  composition:
    withoutStored && composition ? { ...composition, editions: composition.editions.filter((edition) => !edition.snapshot) } : composition,
})
console.log(directory)

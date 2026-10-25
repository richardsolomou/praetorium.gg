import path from 'node:path'
import { parseArgs } from 'node:util'
import { catalogueSources, SNAPSHOT_SOURCE_NAMES } from '../src/server/catalogueSources'
import { readCatalogueComposition } from '../src/server/catalogueComposition'
import { materializeCatalogue } from './lib/catalogueMaterialize'
import { loadCatalogueCredentials } from './lib/catalogueCredentials'

const { values } = parseArgs({ options: { source: { type: 'string' }, 'without-stored-editions': { type: 'boolean' } } })
const { source } = values
// Retired editions pinned to a published snapshot only come from the private store, so a build without its credentials leaves them out.
const withoutStored = values['without-stored-editions'] === true
if (source !== undefined && !SNAPSHOT_SOURCE_NAMES.includes(source as (typeof SNAPSHOT_SOURCE_NAMES)[number])) {
  throw new Error(`expected --source ${SNAPSHOT_SOURCE_NAMES.join('|')}`)
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

import path from 'node:path'
import { catalogueSources, SNAPSHOT_SOURCE_NAMES } from '../src/server/catalogueSources'
import { materializeCatalogue } from './lib/catalogueMaterialize'

const source = process.argv[2] === '--source' ? process.argv[3] : undefined
if (
  process.argv.length !== (source ? 4 : 2) ||
  (source !== undefined && !SNAPSHOT_SOURCE_NAMES.includes(source as (typeof SNAPSHOT_SOURCE_NAMES)[number]))
) {
  throw new Error(`expected no argument or --source ${SNAPSHOT_SOURCE_NAMES.join('|')}`)
}
const directory = process.env.CATALOGUE_DIR ?? path.resolve('.output', ...(source ? ['catalogue-sources', source] : ['catalogue-data']))
await materializeCatalogue(directory, catalogueSources, {
  source: source as (typeof SNAPSHOT_SOURCE_NAMES)[number] | undefined,
  report: console.log,
})
console.log(directory)

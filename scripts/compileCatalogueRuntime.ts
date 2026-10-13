import path from 'node:path'
import { catalogueCacheRoot } from './lib/catalogueCache'
import { prepareCatalogueRuntime } from './lib/catalogueRuntimeCache'

const output = path.resolve(process.env.LOCAL_BUILD_DIR ?? '.output', 'server/catalogue-runtime')
const directory = process.env.CATALOGUE_DIR ?? path.resolve('catalogue-data')
const result = await prepareCatalogueRuntime(directory, output, catalogueCacheRoot('runtime'))
console.log(`Prepared catalogue runtime at ${output} (${result})`)

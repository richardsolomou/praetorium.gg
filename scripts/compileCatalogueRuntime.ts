import path from 'node:path'
import { catalogueCacheRoot } from './lib/catalogueCache'
import { prepareCatalogueRuntime } from './lib/catalogueRuntimeCache'
import { catalogueDataDirectory } from './lib/catalogueFiles'

const output = path.resolve(process.env.LOCAL_BUILD_DIR ?? '.output', 'server/catalogue-runtime')
const directory = catalogueDataDirectory()
const result = await prepareCatalogueRuntime(directory, output, catalogueCacheRoot('runtime'))
console.log(`Prepared catalogue runtime at ${output} (${result})`)

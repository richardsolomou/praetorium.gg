import fs from 'node:fs'
import path from 'node:path'
import { catalogueCacheRoot } from './lib/catalogueCache'
import { prepareCatalogueRuntime, runtimeCacheKey } from './lib/catalogueRuntimeCache'
import { catalogueDataDirectory } from './lib/catalogueFiles'

const server = path.resolve(process.env.LOCAL_BUILD_DIR ?? '.output', 'server')
const output = path.join(server, 'catalogue-runtime')
const directory = catalogueDataDirectory()
if (process.env.CATALOGUE_RUNTIME_FETCH !== 'true') {
  // The seed build just recorded the compiler it bundled.
  const { key } = JSON.parse(fs.readFileSync(path.join(server, 'catalogue-compiler.json'), 'utf8')) as { key: string }
  const result = await prepareCatalogueRuntime(directory, output, catalogueCacheRoot('runtime'), runtimeCacheKey(directory, key))
  console.log(`Prepared catalogue runtime at ${output} (${result})`)
}

import path from 'node:path'
import { runtimeCacheKey } from './lib/catalogueRuntimeCache'

console.log(runtimeCacheKey(process.env.CATALOGUE_DIR ?? path.resolve('catalogue-data')))

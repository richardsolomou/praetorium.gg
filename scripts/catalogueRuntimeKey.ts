import { runtimeCacheKey } from './lib/catalogueRuntimeCache'
import { catalogueDataDirectory } from './lib/catalogueFiles'

console.log(runtimeCacheKey(catalogueDataDirectory()))

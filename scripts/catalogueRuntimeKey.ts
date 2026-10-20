import { runtimeCacheKey } from './lib/catalogueRuntimeCache'
import { catalogueDataDirectory } from './lib/catalogueFiles'
import { compilerFingerprint } from './lib/compilerSources'

console.log(runtimeCacheKey(catalogueDataDirectory(), await compilerFingerprint()))

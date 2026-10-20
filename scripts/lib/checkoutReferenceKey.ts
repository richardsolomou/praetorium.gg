import { runtimeCacheKey } from './catalogueRuntimeCache'
import { compilerFingerprint } from './compilerSources'
import { referenceBundleKey } from './offlineReferenceCache'

/** The offline reference key for a snapshot under this checkout's compiler; for build tools, since it bundles the compiler. */
export async function checkoutReferenceKey(directory: string) {
  return referenceBundleKey(directory, runtimeCacheKey(directory, await compilerFingerprint()))
}

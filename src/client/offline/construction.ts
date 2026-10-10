import { buildIndex } from '../../core/catalogue'
import { unpackRuntimeData } from '../../contracts/runtimeData'
import { catalogueFromIndex, type LoadedCatalogue } from '../../shared/catalogueIndex'
import type { LoadedRules } from '../../shared/rules'
import { referenceData } from './runtime'

let cached: { revision: string; catalogue: LoadedCatalogue; rules: LoadedRules } | undefined

export function localConstruction() {
  const saved = referenceData()?.construction
  if (!saved) return null
  if (cached?.revision === saved.revision) return cached
  const index = buildIndex(saved.files, saved.revision)
  const datacards = unpackRuntimeData<LoadedCatalogue['datacards']>(saved.datacards)
  const catalogue = { ...catalogueFromIndex(index, saved.files, datacards), mfm: unpackRuntimeData<LoadedCatalogue['mfm']>(saved.mfm) }
  cached = { revision: saved.revision, catalogue, rules: unpackRuntimeData<LoadedRules>(saved.rules) }
  return cached
}

export function constructionRead<T>(
  local: (data: NonNullable<ReturnType<typeof localConstruction>>) => T,
  online: () => Promise<T>,
): Promise<T> {
  const data = localConstruction()
  return data ? Promise.resolve(local(data)) : online()
}

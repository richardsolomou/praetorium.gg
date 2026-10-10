import { catalogueEditionId, editionCatalogueFiles } from '../../core/catalogueEdition'
import { buildIndex } from '../../core/catalogue'
import { unpackRuntimeData } from '../../contracts/runtimeData'
import { catalogueFromIndex, type LoadedCatalogue } from '../../shared/catalogueIndex'
import type { LoadedRules } from '../../shared/rules'
import { referenceData } from './runtime'
import { calculationRead } from './calculationRead'
import type { OfflineConstructionSource } from '../../contracts/offlineReference'

const cache = new WeakMap<OfflineConstructionSource, ReturnType<typeof buildConstruction>>()

export function buildConstruction(saved: OfflineConstructionSource) {
  const files = saved.edition ? editionCatalogueFiles(saved.files, saved.edition) : saved.files
  const index = buildIndex(files, saved.revision)
  const datacards = unpackRuntimeData<LoadedCatalogue['datacards']>(saved.datacards)
  const catalogue = {
    ...catalogueFromIndex(index, files, datacards),
    mfm: unpackRuntimeData<LoadedCatalogue['mfm']>(saved.mfm),
    ...(saved.edition ? { edition: saved.edition } : {}),
  }
  return { revision: saved.revision, catalogue, rules: unpackRuntimeData<LoadedRules>(saved.rules) }
}

export function constructionData(catalogueId?: string) {
  const source = referenceData()?.construction
  const edition = catalogueId ? catalogueEditionId(catalogueId) : null
  return edition ? source?.editions?.find((candidate) => candidate.edition?.id === edition) : source
}

export function localConstruction(catalogueId?: string) {
  const saved = constructionData(catalogueId)
  if (!saved) return null
  const existing = cache.get(saved)
  if (existing) return existing
  const built = buildConstruction(saved)
  cache.set(saved, built)
  return built
}

export function constructionRead<T>(
  local: (data: NonNullable<ReturnType<typeof localConstruction>>) => T,
  online: (signal?: AbortSignal) => Promise<T>,
  catalogueId?: string,
  signal?: AbortSignal,
): Promise<T> {
  return calculationRead(
    online,
    (error) => {
      const data = localConstruction(catalogueId)
      if (data) return local(data)
      throw error ?? new Error('Download this army’s rules online before using them offline.')
    },
    signal,
  )
}

import { catalogueEditionId, editionCatalogueFiles } from '../../core/catalogueEdition'
import { datacardExclusions } from '../../core/catalogueReferencePolicy'
import { buildIndex } from '../../core/catalogue'
import { jsonByteLength } from '../../core/json'
import { unpackRuntimeData } from '../../contracts/runtimeData'
import { catalogueFromIndex, type LoadedCatalogue } from '../../shared/catalogueIndex'
import type { LoadedRules } from '../../shared/rules'
import type { OfflineConstructionBase, OfflineConstructionData, OfflineConstructionSource } from '../../contracts/offlineReference'
import { MAX_OFFLINE_BYTES } from '../../contracts/offlineReference'
import { restoreRuntimeData } from '../../contracts/sharedRuntimeData'
import type { RuntimeData } from '../../contracts/runtimeData'
import { restoreReferenceText } from '../../contracts/sharedReferenceText'
import { constructionReads, type ConstructionReadData, type ConstructionReadName, type ConstructionReadResult } from './constructionReads'

const sharedSources = new WeakMap<OfflineConstructionBase | OfflineConstructionSource, OfflineConstructionSource>()

export function buildConstruction(saved: OfflineConstructionSource) {
  const files = saved.edition ? editionCatalogueFiles(saved.files, saved.edition) : saved.files
  const index = buildIndex(files, saved.revision)
  const datacards = unpackRuntimeData<LoadedCatalogue['datacards']>(saved.datacards)
  const catalogue = {
    ...catalogueFromIndex(index, files, datacards),
    datacardExcludedCatalogueIds: datacardExclusions(saved.datacardExcludedCatalogueIds, saved.edition),
    mfm: unpackRuntimeData<LoadedCatalogue['mfm']>(saved.mfm),
    ...(saved.edition ? { edition: saved.edition } : {}),
  }
  return { revision: saved.revision, catalogue, rules: unpackRuntimeData<LoadedRules>(saved.rules) }
}

/** The construction source for a catalogue's rules version, restored from shared data once per selection. */
export function constructionSource(source: OfflineConstructionData | undefined, catalogueId?: string) {
  const edition = catalogueId ? catalogueEditionId(catalogueId) : null
  if (!source) return undefined
  const selected = edition ? source.editions?.find((candidate) => candidate.edition?.id === edition) : source
  if (!selected || (!('base' in selected) && !source.texts && !(edition && source.shared))) return selected
  let complete = sharedSources.get(selected)
  if (!complete && source) {
    const { editions: _editions, texts: _texts, shared: _shared, ...base } = source
    if ('base' in selected) complete = { ...base, edition: selected.edition, revision: selected.revision }
    else if (edition && source.shared) {
      const budget = { remaining: MAX_OFFLINE_BYTES - jsonByteLength(selected) }
      if (budget.remaining < 0) throw new Error('Construction source exceeds its size limit')
      complete = {
        ...selected,
        files: restoreRuntimeData(
          selected.files as unknown as RuntimeData,
          source.files as unknown as RuntimeData,
          budget,
        ) as unknown as OfflineConstructionSource['files'],
        datacards: restoreRuntimeData(selected.datacards, source.datacards, budget),
        mfm: restoreRuntimeData(selected.mfm, source.mfm, budget),
        rules: restoreRuntimeData(selected.rules, source.rules, budget),
      }
    } else complete = selected === source ? base : selected
    if (source.texts) complete = restoreReferenceText(complete, source.texts) as OfflineConstructionSource
    sharedSources.set(selected, complete)
  }
  return complete
}

export function runConstructionRead<K extends ConstructionReadName>(
  name: K,
  construction: Parameters<(typeof constructionReads)[K]>[0],
  data: ConstructionReadData<K>,
): ConstructionReadResult<K> {
  return (constructionReads[name] as (construction: unknown, data: unknown) => ConstructionReadResult<K>)(construction, data)
}

import { catalogueEditionId, editionCatalogueFiles } from '../../core/catalogueEdition'
import { datacardExclusions } from '../../core/catalogueReferencePolicy'
import { buildIndex } from '../../core/catalogue'
import { jsonByteLength } from '../../core/json'
import { unpackRuntimeData } from '../../contracts/runtimeData'
import { catalogueFromIndex, type LoadedCatalogue } from '../../shared/catalogueIndex'
import type { LoadedRules } from '../../shared/rules'
import {
  isConstructionData,
  MAX_CONSTRUCTION_PART_BYTES,
  MAX_OFFLINE_BYTES,
  MAX_REFERENCE_PART_BYTES,
  type OfflineConstructionBase,
  type OfflineConstructionCatalogue,
  type OfflineConstructionData,
  type OfflineConstructionRules,
  type OfflineConstructionSource,
  type OfflineReferenceVersion,
} from '../../contracts/offlineReference'
import { restoreRuntimeData } from '../../contracts/sharedRuntimeData'
import type { RuntimeData } from '../../contracts/runtimeData'
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
  if (!selected || (!('base' in selected) && !(edition && source.shared))) return selected
  let complete = sharedSources.get(selected)
  if (!complete) {
    const { editions: _editions, shared: _shared, ...base } = source
    if ('base' in selected) complete = { ...base, edition: selected.edition, revision: selected.revision }
    else {
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
    }
    sharedSources.set(selected, complete)
  }
  return complete
}

const assembled = new WeakMap<OfflineConstructionCatalogue, OfflineConstructionData>()

/**
 * Loads the construction data a rules version needs from the download's parts, once per download: the current rules'
 * catalogue and rules, and the version's own part when it is another one. `read` decodes a part by its address.
 */
export async function loadConstructionData(
  parts: OfflineReferenceVersion['construction'],
  catalogueId: string | undefined,
  read: (asset: string, limit: number) => Promise<unknown>,
): Promise<OfflineConstructionData> {
  const [catalogue, { rules }] = (await Promise.all([
    read(parts.catalogue, MAX_CONSTRUCTION_PART_BYTES),
    read(parts.rules, MAX_REFERENCE_PART_BYTES),
  ])) as [OfflineConstructionCatalogue, OfflineConstructionRules]
  let data = assembled.get(catalogue)
  if (!data) assembled.set(catalogue, (data = { ...catalogue, rules, shared: true, editions: [...catalogue.editions] }))
  const edition = catalogueId ? catalogueEditionId(catalogueId) : null
  const asset = edition && parts.editions[edition]
  if (!isConstructionData(data)) throw new Error('The saved construction data is invalid')
  const loaded = () => data.editions!.some((source) => source.edition?.id === edition)
  if (asset && !loaded()) {
    const part = (await read(asset, MAX_CONSTRUCTION_PART_BYTES)) as OfflineConstructionSource
    if (!isConstructionData({ ...data, editions: [...data.editions!, part] })) throw new Error('The saved construction data is invalid')
    // Another read of the same version may have added it meanwhile.
    if (!loaded()) data.editions!.push(part)
  }
  return data
}

export function runConstructionRead<K extends ConstructionReadName>(
  name: K,
  construction: Parameters<(typeof constructionReads)[K]>[0],
  data: ConstructionReadData<K>,
): ConstructionReadResult<K> {
  return (constructionReads[name] as (construction: unknown, data: unknown) => ConstructionReadResult<K>)(construction, data)
}

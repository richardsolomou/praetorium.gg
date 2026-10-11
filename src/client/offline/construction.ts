import { catalogueEditionId, editionCatalogueFiles } from '../../core/catalogueEdition'
import { datacardExclusions } from '../../core/catalogueReferencePolicy'
import { buildIndex } from '../../core/catalogue'
import { unpackRuntimeData } from '../../contracts/runtimeData'
import { catalogueFromIndex, type LoadedCatalogue } from '../../shared/catalogueIndex'
import type { LoadedRules } from '../../shared/rules'
import { referenceData } from './runtime'
import { calculationRead } from './calculationRead'
import type { OfflineConstructionBase, OfflineConstructionSource } from '../../contracts/offlineReference'
import { MAX_OFFLINE_BYTES } from '../../contracts/offlineReference'
import { restoreRuntimeData } from '../../contracts/sharedRuntimeData'
import type { RuntimeData } from '../../contracts/runtimeData'
import { restoreReferenceText } from '../../contracts/sharedReferenceText'
import { TERRAIN_GEOMETRY_VERSION } from '../../contracts/terrainReference'
import type { TerrainLayout, TerrainTemplate } from '../../contracts/terrain'

const cache = new WeakMap<OfflineConstructionSource, ReturnType<typeof buildConstruction>>()
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

export function constructionData(catalogueId?: string) {
  const source = referenceData()?.construction
  const edition = catalogueId ? catalogueEditionId(catalogueId) : null
  if (!source) return undefined
  const selected = edition ? source.editions?.find((candidate) => candidate.edition?.id === edition) : source
  if (!selected || (!('base' in selected) && !source.texts && !(edition && source.shared))) return selected
  let complete = sharedSources.get(selected)
  if (!complete && source) {
    const { editions: _editions, texts: _texts, shared: _shared, ...base } = source
    if ('base' in selected) complete = { ...base, edition: selected.edition, revision: selected.revision }
    else if (edition && source.shared) {
      const budget = { remaining: MAX_OFFLINE_BYTES - new TextEncoder().encode(JSON.stringify(selected)).byteLength }
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

export function localConstruction(catalogueId?: string) {
  const saved = constructionData(catalogueId)
  if (!saved) return null
  const existing = cache.get(saved)
  if (existing) return existing
  const built = buildConstruction(saved)
  const terrain =
    referenceData()
      ?.queries?.filter(({ key }) => key[0] === 'terrain-references' && key[1] === TERRAIN_GEOMETRY_VERSION)
      .map(({ data }) => data as { layouts: TerrainLayout[]; templates: TerrainTemplate[] }) ?? []
  if (terrain.length) {
    built.rules.terrainLayouts = [
      ...new Map(terrain.flatMap(({ layouts }) => layouts.map((layout) => [layout.id, layout] as const))).values(),
    ]
    built.rules.terrainTemplates = [
      ...new Map(terrain.flatMap(({ templates }) => templates.map((template) => [template.id, template] as const))).values(),
    ]
  }
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

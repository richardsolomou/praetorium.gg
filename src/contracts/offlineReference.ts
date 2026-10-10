import { PUBLIC_REFERENCE_QUERIES } from './appSnapshot'
import type { GlobalSearchIndex } from './referenceSearch'
import type { RuntimeData } from './runtimeData'
import type { CatalogueFile } from '../core/catalogue'

export type OfflineConstructionData = {
  version: 1
  revision: string
  files: CatalogueFile[]
  datacards: RuntimeData
  mfm: RuntimeData
  rules: RuntimeData
}

export type OfflineReferenceData = {
  version: 1
  savedAt: number
  revision: string
  appRevision?: string
  queries: { key: readonly unknown[]; data: unknown }[]
  search: GlobalSearchIndex
  css: string
  logo: string
  construction?: OfflineConstructionData
}

export const MAX_OFFLINE_BYTES = 100_000_000
export const MAX_OFFLINE_QUERIES = 20_000

export type OfflineReferenceBundle = Pick<OfflineReferenceData, 'version' | 'revision' | 'queries' | 'search' | 'construction'>
export type OfflineReferenceVersion = { revision: string; bundle: string }
export type OfflineAppVersion = { revision: string; css: string; script: string }

export function isReferenceBundle(value: unknown): value is OfflineReferenceBundle {
  const data = value as OfflineReferenceBundle | null
  return (
    data?.version === 1 &&
    typeof data.revision === 'string' &&
    (data.construction === undefined ||
      (data.construction.version === 1 &&
        typeof data.construction.revision === 'string' &&
        data.construction.revision.length > 0 &&
        Array.isArray(data.construction.files) &&
        data.construction.files.length <= 1_000 &&
        data.construction.files.every((file) => typeof file === 'object' && file !== null) &&
        data.construction.datacards !== undefined &&
        data.construction.mfm !== undefined &&
        data.construction.rules !== undefined)) &&
    Array.isArray(data.queries) &&
    data.queries.length <= MAX_OFFLINE_QUERIES &&
    data.queries.every((entry) => Array.isArray(entry?.key) && PUBLIC_REFERENCE_QUERIES.has(String(entry.key[0]))) &&
    data.search &&
    ['factions', 'detachments', 'datasheets', 'missions', 'rules'].every((key) =>
      Array.isArray(data.search[key as keyof typeof data.search]),
    )
  )
}

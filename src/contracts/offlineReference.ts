import { PUBLIC_REFERENCE_QUERIES } from './appSnapshot'
import type { GlobalSearchIndex } from './referenceSearch'

export type OfflineReferenceData = {
  version: 1
  savedAt: number
  revision: string
  appRevision?: string
  queries: { key: readonly unknown[]; data: unknown }[]
  search: GlobalSearchIndex
  css: string
  logo: string
}

export const MAX_OFFLINE_BYTES = 100_000_000
export const MAX_OFFLINE_QUERIES = 20_000

export type OfflineReferenceBundle = Pick<OfflineReferenceData, 'version' | 'revision' | 'queries' | 'search'>
export type OfflineReferenceVersion = { revision: string; bundle: string }
export type OfflineAppVersion = { revision: string; css: string; script: string }

export function isReferenceBundle(value: unknown): value is OfflineReferenceBundle {
  const data = value as OfflineReferenceBundle | null
  return (
    data?.version === 1 &&
    typeof data.revision === 'string' &&
    Array.isArray(data.queries) &&
    data.queries.length <= MAX_OFFLINE_QUERIES &&
    data.queries.every((entry) => Array.isArray(entry?.key) && PUBLIC_REFERENCE_QUERIES.has(String(entry.key[0]))) &&
    data.search &&
    ['factions', 'detachments', 'datasheets', 'missions', 'rules'].every((key) =>
      Array.isArray(data.search[key as keyof typeof data.search]),
    )
  )
}

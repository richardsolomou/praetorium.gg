import { notifyManager, type QueryClient } from '@tanstack/react-query'
import { referenceData } from './runtime'
import { MAX_OFFLINE_BYTES, MAX_OFFLINE_QUERIES, type OfflineReferenceData } from '../../contracts/offlineReference'

export function savedReferenceData(html: string): OfflineReferenceData | null {
  if (html.length > MAX_OFFLINE_BYTES) return null
  const serialized = html.match(/<script>window\.PraetoriumOffline=([^]*?);<\/script>/)?.[1]
  if (!serialized) return null
  try {
    const data = JSON.parse(serialized) as OfflineReferenceData
    return data?.version === 1 &&
      Array.isArray(data.queries) &&
      data.queries.length <= MAX_OFFLINE_QUERIES &&
      data.queries.every((entry) => Array.isArray(entry?.key)) &&
      typeof data.revision === 'string' &&
      Number.isFinite(data.savedAt) &&
      data.search &&
      ['factions', 'detachments', 'datasheets', 'missions', 'rules'].every((key) =>
        Array.isArray(data.search[key as keyof typeof data.search]),
      )
      ? data
      : null
  } catch {
    return null
  }
}

export function applyReferenceData(client: QueryClient, data: OfflineReferenceData) {
  const previous = referenceData()
  if (window.PraetoriumOffline) window.PraetoriumOffline = data
  window.PraetoriumReferenceCache = data
  notifyManager.batch(() => {
    const keys = new Set(data.queries.map((entry) => JSON.stringify(entry.key)))
    for (const entry of previous?.queries ?? []) {
      if (!keys.has(JSON.stringify(entry.key))) client.setQueryData(entry.key, null)
    }
    for (const entry of data.queries) client.setQueryData(entry.key, entry.data)
    void client.invalidateQueries({
      predicate: (query) =>
        query.queryKey[0] === 'global-search' || (query.queryKey[0] === 'faction-datasheets' && query.queryKey[2] !== ''),
    })
  })
}

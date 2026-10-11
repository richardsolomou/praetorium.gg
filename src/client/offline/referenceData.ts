import { notifyManager, type QueryClient } from '@tanstack/react-query'
import { referenceData } from './runtime'
import { MAX_OFFLINE_BYTES, isReferenceBundle, type OfflineReferenceData } from '../../contracts/offlineReference'

export function savedReferenceData(html: string): OfflineReferenceData | null {
  if (html.length > MAX_OFFLINE_BYTES) return null
  const serialized = html.match(/<script>window\.PraetoriumOffline=([^]*?);<\/script>/)?.[1]
  if (!serialized) return null
  try {
    const data = JSON.parse(serialized) as OfflineReferenceData
    return isReferenceBundle(data) && Number.isFinite(data.savedAt) ? data : null
  } catch {
    return null
  }
}

export function applyReferenceData(client: QueryClient, data: OfflineReferenceData, restore = false) {
  const previous = referenceData()
  if (window.PraetoriumOffline) window.PraetoriumOffline = data
  window.PraetoriumReferenceCache = data
  if (previous?.revision === data.revision && !restore) return
  notifyManager.batch(() => {
    const keys = new Set(data.queries.map((entry) => JSON.stringify(entry.key)))
    for (const entry of restore ? [] : (previous?.queries ?? [])) {
      if (!keys.has(JSON.stringify(entry.key))) client.setQueryData(entry.key, null)
    }
    for (const entry of data.queries) {
      if (!restore || client.getQueryData(entry.key) === undefined) client.setQueryData(entry.key, entry.data)
    }
    if (restore) return
    void client.invalidateQueries({
      predicate: (query) =>
        query.queryKey[0] === 'global-search' || (query.queryKey[0] === 'faction-datasheets' && query.queryKey[2] !== ''),
    })
  })
}

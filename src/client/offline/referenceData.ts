import { notifyManager, type QueryClient } from '@tanstack/react-query'
import { referenceChanged, referenceData, savedQuery } from './runtime'
import type { OfflineReferenceData } from '../../contracts/offlineReference'

export function applyReferenceData(client: QueryClient, data: OfflineReferenceData, restore = false) {
  const previous = referenceData()
  if (window.PraetoriumOffline) window.PraetoriumOffline = data
  window.PraetoriumReferenceCache = data
  referenceChanged()
  if (previous?.revision === data.revision && !restore) return
  notifyManager.batch(() => {
    const keys = new Set(data.queries.map((entry) => JSON.stringify(entry.key)))
    for (const entry of restore ? [] : (previous?.queries ?? [])) {
      if (!keys.has(JSON.stringify(entry.key))) client.setQueryData(entry.key, null)
    }
    if (restore) {
      // Reference queries read the download when they are created, so restoring fills only those already waiting.
      for (const query of client.getQueryCache().getAll()) {
        const saved = query.state.data === undefined ? savedQuery(data, query.queryKey) : undefined
        if (saved !== undefined) client.setQueryData(query.queryKey, saved)
      }
      return
    }
    for (const entry of data.queries) client.setQueryData(entry.key, entry.data)
    void client.invalidateQueries({
      predicate: (query) =>
        query.queryKey[0] === 'global-search' || (query.queryKey[0] === 'faction-datasheets' && query.queryKey[2] !== ''),
    })
  })
}

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
    // Reference queries read the download when they are created, so only those already made take it: restoring fills
    // the ones still waiting, and a new revision replaces what they hold. Filling every query would parse the whole download at once.
    for (const query of client.getQueryCache().getAll()) {
      if (restore && query.state.data !== undefined) continue
      const saved = savedQuery(data, query.queryKey)
      if (saved !== undefined) client.setQueryData(query.queryKey, saved)
    }
    if (restore) return
    void client.invalidateQueries({
      predicate: (query) =>
        query.queryKey[0] === 'global-search' || (query.queryKey[0] === 'faction-datasheets' && query.queryKey[2] !== ''),
    })
  })
}

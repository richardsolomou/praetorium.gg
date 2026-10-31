import { notifyManager, type QueryClient } from '@tanstack/react-query'
import { loadSavedQuery, referenceChanged, referenceData } from './runtime'
import { PUBLIC_REFERENCE_QUERIES } from '../../contracts/appSnapshot'
import { referencePart, type OfflineReferenceData } from '../../contracts/offlineReference'
import { groupBy } from '../../core/collections'

export async function applyReferenceData(client: QueryClient, data: OfflineReferenceData, restore = false) {
  const previous = referenceData()
  if (window.PraetoriumOffline) window.PraetoriumOffline = data
  window.PraetoriumReferenceCache = data
  referenceChanged()
  if (previous?.download.revision === data.download.revision && !restore) return
  // Reference queries read the download when they are created, so only those already made take it: restoring fills
  // the ones still waiting, and a new revision replaces what they hold. Grouped by part, so each part decodes once.
  const queries = client
    .getQueryCache()
    .getAll()
    .filter((query) => PUBLIC_REFERENCE_QUERIES.has(String(query.queryKey[0])) && !(restore && query.state.data !== undefined))
  for (const group of groupBy(queries, (query) => referencePart(query.queryKey)).values()) {
    const found = await Promise.all(group.map((query) => loadSavedQuery(data, query.queryKey)))
    if (referenceData() !== data) return
    notifyManager.batch(() =>
      group.forEach((query, at) => {
        if (found[at] !== undefined && !(restore && query.state.data !== undefined)) client.setQueryData(query.queryKey, found[at])
        else if (!restore) void client.invalidateQueries({ queryKey: query.queryKey, exact: true })
      }),
    )
  }
  if (!restore)
    void client.invalidateQueries({
      predicate: (query) =>
        query.queryKey[0] === 'global-search' || (query.queryKey[0] === 'faction-datasheets' && query.queryKey[2] !== ''),
    })
}

import { offlineData, referenceData } from './offline/runtime'
import { MutationCache } from '@tanstack/react-query'
import { createStackQueryClient, queryErrorMessage } from 'ras-stack/tanstack/query'
import { restoreAppSnapshot } from './offline/appSnapshot'

export function createQueryClient() {
  const client = createStackQueryClient({
    // Onboarding progress is folded from rows anything can write, so any successful write may have finished a task.
    mutationCache: new MutationCache({ onSuccess: () => void client.invalidateQueries({ queryKey: ['onboarding'] }) }),
  })
  const saved = referenceData()
  if (offlineData()) {
    client.setDefaultOptions({ queries: { retry: false, staleTime: 1000 } })
    if (window.PraetoriumAppSnapshot) restoreAppSnapshot(client, window.PraetoriumAppSnapshot)
    if (client.getQueryData(['me']) === undefined) client.setQueryData(['me'], null)
    if (!client.getQueryData(['me'])) {
      client.setQueryData(['favourite-factions'], [])
      client.setQueryData(['favourite-detachments'], [])
    }
  }
  if (saved) for (const entry of saved.queries) client.setQueryData(entry.key, entry.data)
  return client
}

export const errorMessage = queryErrorMessage

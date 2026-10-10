import { offlineData, referenceData } from './offline/runtime'
import { MutationCache, QueryClient } from '@tanstack/react-query'
import { captureAppSnapshot, restoreAppSnapshot } from './offline/appSnapshot'
import { writeAppSnapshot } from './offline/appStorage'
import { configureLocalRuntime } from './offline/localRuntime'
import { projectLocalState } from './functions'

export function createQueryClient() {
  const client = new QueryClient({
    defaultOptions: { queries: { staleTime: 1000, networkMode: 'always' }, mutations: { networkMode: 'always' } },
    // Onboarding progress is folded from rows anything can write, so any successful write may have finished a task.
    mutationCache: new MutationCache({
      onSuccess: () => void client.invalidateQueries({ queryKey: ['onboarding'] }),
      onSettled: async (_data, error) => {
        if (!error && typeof window !== 'undefined') {
          await writeAppSnapshot(captureAppSnapshot(client)).catch(() => {})
        }
      },
    }),
  })
  const saved = referenceData()
  if (offlineData()) {
    client.setDefaultOptions({ queries: { retry: false, staleTime: 1000, networkMode: 'always' }, mutations: { networkMode: 'always' } })
    if (window.PraetoriumAppSnapshot) restoreAppSnapshot(client, window.PraetoriumAppSnapshot)
    if (client.getQueryData(['me']) === undefined) client.setQueryData(['me'], null)
    if (!client.getQueryData(['me'])) {
      client.setQueryData(['favourite-factions'], [])
      client.setQueryData(['favourite-detachments'], [])
    }
  }
  if (saved) for (const entry of saved.queries) client.setQueryData(entry.key, entry.data)
  configureLocalRuntime(client, projectLocalState)
  return client
}

export function errorMessage(error: unknown, fallback = 'Something went wrong. Try again.') {
  return error instanceof Error && error.message ? error.message : fallback
}

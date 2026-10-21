import { offlineData } from './offline/runtime'
import { MutationCache } from '@tanstack/react-query'
import { createQueryClient as configuredQueryClient } from 'ras-stack/query'
import { captureAppSnapshot, restoreAppSnapshot } from './offline/appSnapshot'
import { writeAppSnapshot } from './offline/appStorage'
import { configureLocalRuntime } from './offline/localRuntime'
import { projectLocalState } from './functions'
import {
  favouriteDatasheetsKey,
  favouriteDetachmentsKey,
  favouriteFactionsKey,
  meKey,
  onboardingKey,
  recentMatchupsKey,
} from './queries/queryKeys'

export function createQueryClient() {
  const client = configuredQueryClient({
    defaultOptions: { queries: { staleTime: 1000, networkMode: 'always' }, mutations: { networkMode: 'always' } },
    // Onboarding progress is folded from rows anything can write, so any successful write may have finished a task.
    mutationCache: new MutationCache({
      onSuccess: () => void client.invalidateQueries({ queryKey: onboardingKey() }),
      onSettled: async (_data, error) => {
        if (!error && typeof window !== 'undefined') {
          await writeAppSnapshot(captureAppSnapshot(client)).catch(() => {})
        }
      },
    }),
  })
  const saved = offlineData()
  if (saved) {
    client.setDefaultOptions({ queries: { retry: false, staleTime: 1000, networkMode: 'always' }, mutations: { networkMode: 'always' } })
    if (window.PraetoriumAppSnapshot) restoreAppSnapshot(client, window.PraetoriumAppSnapshot)
    if (client.getQueryData(meKey()) === undefined) client.setQueryData(meKey(), null)
    if (!client.getQueryData(meKey())) {
      client.setQueryData(favouriteFactionsKey(), [])
      client.setQueryData(favouriteDetachmentsKey(), [])
      client.setQueryData(favouriteDatasheetsKey(), [])
      client.setQueryData(recentMatchupsKey(), [])
    }
    for (const entry of saved.queries) client.setQueryData(entry.key, entry.data)
  }
  configureLocalRuntime(client, projectLocalState)
  return client
}

export function errorMessage(error: unknown, fallback = 'Something went wrong. Try again.') {
  return error instanceof Error && error.message ? error.message : fallback
}

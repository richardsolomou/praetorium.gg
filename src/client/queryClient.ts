import { offlineData } from './offline/runtime'
import { MutationCache, QueryCache, type Query } from '@tanstack/react-query'
import { posthog } from 'posthog-js'
import { isSignedOut } from '../core/session'
import { isFetchNetworkFailure } from './networkErrors'
import { OfflineRefusal } from './offline/offlineRefusal'
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
    queryCache: new QueryCache({ onError: reportQueryFailure }),
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
  }
  configureLocalRuntime(client, projectLocalState)
  return client
}

export function errorMessage(error: unknown, fallback = 'Something went wrong. Try again.') {
  return error instanceof Error && error.message ? error.message : fallback
}

/** Rules text reports its own failures with the source that failed. */
const SELF_REPORTED = new Set(['rules-text'])

/** Counts each read that failed, by the static name its key starts with; a signed-out or offline refusal is an answer, not a failure. */
function reportQueryFailure(error: unknown, query: Pick<Query, 'queryKey'>) {
  if (typeof window === 'undefined' || isSignedOut(error) || error instanceof OfflineRefusal) return
  const [name] = query.queryKey
  if (typeof name === 'string' && SELF_REPORTED.has(name)) return
  posthog.capture('query_load_failed', {
    query: typeof name === 'string' && /^[a-z][a-z-]{0,39}$/.test(name) ? name : 'other',
    reason: isFetchNetworkFailure(error) ? 'network' : 'error',
    offline: !navigator.onLine,
  })
}

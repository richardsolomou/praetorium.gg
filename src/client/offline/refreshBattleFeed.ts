import type { QueryClient } from '@tanstack/react-query'
import type { battlesQuery } from '../queries/battles'

export function refreshBattleFeed(client: QueryClient, options: ReturnType<typeof battlesQuery>) {
  const query = client.getQueryCache().find({ queryKey: options.queryKey })
  const saved = client.getQueryData(options.queryKey)
  // Loaded history refetches when its screen becomes active, without trimming pagination.
  if (!query?.isActive() && saved && saved.pages.length > 1) return Promise.resolve(saved)
  return client.infiniteQuery({ ...options, staleTime: Infinity })
}

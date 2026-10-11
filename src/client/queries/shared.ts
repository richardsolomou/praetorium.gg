import { queryOptions } from '@tanstack/react-query'
import { offlineData, referenceData, referenceRead } from '../offline/runtime'

export const SSR_STALE_TIME = 30_000

export function referenceQuery<T>(key: readonly unknown[], online: () => Promise<T>) {
  return queryOptions({
    queryKey: key,
    queryFn: ({ client }) => referenceRead(key, online, client.getQueryData<T>(key)),
    initialData: () => referenceData()?.queries.find((entry) => JSON.stringify(entry.key) === JSON.stringify(key))?.data as T | undefined,
    initialDataUpdatedAt: () => referenceData()?.savedAt ?? 0,
    staleTime: () => (offlineData() ? Infinity : SSR_STALE_TIME),
  })
}

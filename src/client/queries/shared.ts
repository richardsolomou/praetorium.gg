import { queryOptions } from '@tanstack/react-query'
import { currentReference, referenceData, referenceRead, savedQuery } from '../offline/runtime'

export const SSR_STALE_TIME = 30_000

/** Downloaded reference data stays fresh for as long as the service still publishes its revision. */
export const referenceStaleTime = () => (currentReference() ? Infinity : SSR_STALE_TIME)

export function referenceQuery<T>(key: readonly unknown[], online: () => Promise<T>) {
  return queryOptions({
    queryKey: key,
    queryFn: ({ client }) => referenceRead(key, online, client.getQueryData<T>(key)),
    initialData: () => savedQuery<T>(referenceData(), key),
    initialDataUpdatedAt: () => (currentReference() ? Date.now() : (referenceData()?.savedAt ?? 0)),
    staleTime: referenceStaleTime,
  })
}

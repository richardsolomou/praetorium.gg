import { queryOptions } from '@tanstack/react-query'
import { currentReference, referenceData, referenceRead, savedQuery } from '../offline/runtime'

export const SSR_STALE_TIME = 30_000

/** Rejects a missing page so TanStack Query reports a failed read and keeps the last good pages instead of caching it. */
export function requirePage<T>(feed: string) {
  return (page: T | null | undefined): T => {
    if (page == null) throw new Error(`The ${feed} returned no page.`)
    return page
  }
}

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

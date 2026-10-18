import { useQuery } from '@tanstack/react-query'
import { useCallback, useMemo } from 'react'
import { setFavouriteDatasheet } from './functions'
import { useOptimisticList } from './optimisticList'
import { favouriteDatasheetsQuery } from './queries'

/** Stable between favourite changes, so memoized picker rows only redraw when a heart actually changes. */
export function useFavouriteDatasheets(enabled = true) {
  const query = favouriteDatasheetsQuery()
  const { data, isPending } = useQuery({ ...query, enabled })
  const mutation = useOptimisticList<string, { entryId: string; favourite: boolean }>(
    query.queryKey,
    ({ entryId, favourite }) => setFavouriteDatasheet({ data: { entryId, favourite } }),
    (previous, { entryId, favourite }) => (favourite ? [...new Set([...previous, entryId])] : previous.filter((id) => id !== entryId)),
  )
  const favourites = useMemo(() => new Set(data ?? []), [data])
  const { mutate } = mutation
  const toggleFavourite = useCallback((entryId: string) => mutate({ entryId, favourite: !favourites.has(entryId) }), [mutate, favourites])
  return { favourites, loading: enabled && isPending, toggleFavourite, pending: mutation }
}

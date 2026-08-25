import { useQuery } from '@tanstack/react-query'
import type { z } from 'zod'
import { setFavouriteDetachment } from '../server/functions'
import type { favouriteDetachmentSchema } from '../server/schemas'
import { useOptimisticFavourites } from './favourites'
import { favouriteDetachmentsQuery } from './queries'

type FavouriteDetachment = Omit<z.infer<typeof favouriteDetachmentSchema>, 'favourite'>

export const favouriteDetachmentKey = (catalogueId: string, detachmentId: string) => JSON.stringify([catalogueId, detachmentId])

export function useFavouriteDetachments(enabled = true) {
  const query = favouriteDetachmentsQuery()
  const { data = [] } = useQuery({ ...query, enabled })
  const mutation = useOptimisticFavourites<FavouriteDetachment, FavouriteDetachment & { favourite: boolean }>(
    query.queryKey,
    ({ catalogueId, detachmentId, favourite }) => setFavouriteDetachment({ data: { catalogueId, detachmentId, favourite } }),
    (previous, { catalogueId, detachmentId, favourite }) => {
      const key = favouriteDetachmentKey(catalogueId, detachmentId)
      const kept = previous.filter((entry) => favouriteDetachmentKey(entry.catalogueId, entry.detachmentId) !== key)
      return favourite ? [...kept, { catalogueId, detachmentId }] : kept
    },
  )
  const favourites = new Set(data.map((entry) => favouriteDetachmentKey(entry.catalogueId, entry.detachmentId)))
  return {
    favourites,
    toggleFavourite: (catalogueId: string, detachmentId: string) =>
      mutation.mutate({ catalogueId, detachmentId, favourite: !favourites.has(favouriteDetachmentKey(catalogueId, detachmentId)) }),
    pending: mutation,
  }
}

export const favouriteDetachmentsFirst = <T extends { id: string }>(
  entries: readonly T[],
  catalogueId: string,
  favourites: ReadonlySet<string>,
) =>
  entries.toSorted(
    (left, right) =>
      Number(favourites.has(favouriteDetachmentKey(catalogueId, right.id))) -
      Number(favourites.has(favouriteDetachmentKey(catalogueId, left.id))),
  )

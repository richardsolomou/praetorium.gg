import { useQuery } from '@tanstack/react-query'
import { favouriteDetachmentKey, withFavouriteDetachment, type FavouriteDetachment } from '../core/favouriteDetachments'
import { setFavouriteDetachment } from './functions'
import { useOptimisticList } from './optimisticList'
import { favouriteDetachmentsQuery } from './queries'

export function useFavouriteDetachments(enabled = true) {
  const query = favouriteDetachmentsQuery()
  const { data = [] } = useQuery({ ...query, enabled })
  const mutation = useOptimisticList<FavouriteDetachment, FavouriteDetachment & { favourite: boolean }>(
    query.queryKey,
    ({ catalogueId, detachmentId, favourite }) => setFavouriteDetachment({ data: { catalogueId, detachmentId, favourite } }),
    withFavouriteDetachment,
  )
  const favourites = new Set(data.map((entry) => favouriteDetachmentKey(entry.catalogueId, entry.detachmentId)))
  return {
    favourites,
    toggleFavourite: (catalogueId: string, detachmentId: string) =>
      mutation.mutate({ catalogueId, detachmentId, favourite: !favourites.has(favouriteDetachmentKey(catalogueId, detachmentId)) }),
    pending: mutation,
  }
}

/** Reads names the way a player does: case and accents aside, and numbers by value. */
const byName = new Intl.Collator(undefined, { sensitivity: 'base', numeric: true })

/** The player's favourite detachments first, then the rest, each part alphabetical. */
export const favouriteDetachmentsFirst = <T extends { id: string; name: string }>(
  entries: readonly T[],
  catalogueId: string,
  favourites: ReadonlySet<string>,
) =>
  entries.toSorted(
    (left, right) =>
      Number(favourites.has(favouriteDetachmentKey(catalogueId, right.id))) -
        Number(favourites.has(favouriteDetachmentKey(catalogueId, left.id))) || byName.compare(left.name, right.name),
  )

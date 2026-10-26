import { useQuery } from '@tanstack/react-query'
import { withMember } from '../core/collections'
import { setFavouriteFaction } from './functions'
import { useOptimisticList } from './optimisticList'
import { favouriteFactionsQuery } from './queries'

export function useFavouriteFactions(enabled = true) {
  const query = favouriteFactionsQuery()
  const { data = [] } = useQuery({ ...query, enabled })
  const mutation = useOptimisticList<string, { catalogueId: string; favourite: boolean }>(
    query.queryKey,
    ({ catalogueId, favourite }) => setFavouriteFaction({ data: { catalogueId, favourite } }),
    (previous, { catalogueId, favourite }) => withMember(previous, catalogueId, favourite),
  )
  const favourites = new Set(data)
  return {
    favourites,
    toggleFavourite: (catalogueId: string) => mutation.mutate({ catalogueId, favourite: !favourites.has(catalogueId) }),
    pending: mutation,
  }
}

export const favouritesFirst = <T extends { id: string }>(entries: readonly T[], favourites: ReadonlySet<string>) =>
  entries.toSorted((left, right) => Number(favourites.has(right.id)) - Number(favourites.has(left.id)))

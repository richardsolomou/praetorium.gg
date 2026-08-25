import { useQuery } from '@tanstack/react-query'
import { setFavouriteFaction } from '../server/functions'
import { useOptimisticFavourites } from './favourites'
import { favouriteFactionsQuery } from './queries'

export function useFavouriteFactions(enabled = true) {
  const query = favouriteFactionsQuery()
  const { data = [] } = useQuery({ ...query, enabled })
  const mutation = useOptimisticFavourites<string, { catalogueId: string; favourite: boolean }>(
    query.queryKey,
    ({ catalogueId, favourite }) => setFavouriteFaction({ data: { catalogueId, favourite } }),
    (previous, { catalogueId, favourite }) =>
      favourite ? [...new Set([...previous, catalogueId])] : previous.filter((id) => id !== catalogueId),
  )
  const favourites = new Set(data)
  return { favourites, toggleFavourite: (catalogueId: string) => mutation.mutate({ catalogueId, favourite: !favourites.has(catalogueId) }) }
}

export const favouritesFirst = <T extends { id: string }>(entries: readonly T[], favourites: ReadonlySet<string>) =>
  entries.toSorted((left, right) => Number(favourites.has(right.id)) - Number(favourites.has(left.id)))

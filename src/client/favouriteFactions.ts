import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { setFavouriteFaction } from '../server/functions'
import { favouriteFactionsQuery } from './queries'

export function useFavouriteFactions() {
  const query = favouriteFactionsQuery()
  const queryClient = useQueryClient()
  const { data = [] } = useQuery(query)
  const mutation = useMutation({
    mutationFn: ({ catalogueId, favourite }: { catalogueId: string; favourite: boolean }) =>
      setFavouriteFaction({ data: { catalogueId, favourite } }),
    onMutate: async ({ catalogueId, favourite }) => {
      await queryClient.cancelQueries({ queryKey: query.queryKey })
      const previous = queryClient.getQueryData<string[]>(query.queryKey) ?? []
      queryClient.setQueryData<string[]>(
        query.queryKey,
        favourite ? [...new Set([...previous, catalogueId])] : previous.filter((id) => id !== catalogueId),
      )
      return { previous }
    },
    onError: (_error, _input, context) => queryClient.setQueryData(query.queryKey, context?.previous ?? []),
    onSettled: () => queryClient.invalidateQueries({ queryKey: query.queryKey }),
  })
  const favourites = new Set(data)
  return { favourites, toggleFavourite: (catalogueId: string) => mutation.mutate({ catalogueId, favourite: !favourites.has(catalogueId) }) }
}

export const favouritesFirst = <T extends { id: string }>(entries: readonly T[], favourites: ReadonlySet<string>) =>
  entries.toSorted((left, right) => Number(favourites.has(right.id)) - Number(favourites.has(left.id)))

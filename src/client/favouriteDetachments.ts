import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { setFavouriteDetachment } from '../server/functions'
import { favouriteDetachmentsQuery } from './queries'

type FavouriteDetachment = { catalogueId: string; detachmentId: string }

export const favouriteDetachmentKey = (catalogueId: string, detachmentId: string) => JSON.stringify([catalogueId, detachmentId])

export function useFavouriteDetachments() {
  const query = favouriteDetachmentsQuery()
  const queryClient = useQueryClient()
  const { data = [] } = useQuery(query)
  const mutation = useMutation({
    mutationFn: ({ catalogueId, detachmentId, favourite }: FavouriteDetachment & { favourite: boolean }) =>
      setFavouriteDetachment({ data: { catalogueId, detachmentId, favourite } }),
    onMutate: async ({ catalogueId, detachmentId, favourite }) => {
      await queryClient.cancelQueries({ queryKey: query.queryKey })
      const previous = queryClient.getQueryData<FavouriteDetachment[]>(query.queryKey) ?? []
      queryClient.setQueryData<FavouriteDetachment[]>(
        query.queryKey,
        favourite
          ? [
              ...previous.filter(
                (entry) =>
                  favouriteDetachmentKey(entry.catalogueId, entry.detachmentId) !== favouriteDetachmentKey(catalogueId, detachmentId),
              ),
              { catalogueId, detachmentId },
            ]
          : previous.filter(
              (entry) =>
                favouriteDetachmentKey(entry.catalogueId, entry.detachmentId) !== favouriteDetachmentKey(catalogueId, detachmentId),
            ),
      )
      return { previous }
    },
    onError: (_error, _input, context) => queryClient.setQueryData(query.queryKey, context?.previous ?? []),
    onSettled: () => queryClient.invalidateQueries({ queryKey: query.queryKey }),
  })
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

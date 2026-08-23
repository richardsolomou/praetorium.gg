import { useMutation, useQueryClient } from '@tanstack/react-query'

/**
 * The optimistic scaffold every favourite toggle shares: paint the change into
 * the cache immediately, keep the previous value to roll back to if the server
 * refuses, and invalidate once it has answered.
 */
export function useOptimisticFavourites<TEntry, TInput extends { favourite: boolean }>(
  queryKey: readonly unknown[],
  mutationFn: (input: TInput) => Promise<unknown>,
  apply: (previous: TEntry[], input: TInput) => TEntry[],
) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn,
    onMutate: async (input) => {
      await queryClient.cancelQueries({ queryKey })
      const previous = queryClient.getQueryData<TEntry[]>(queryKey) ?? []
      queryClient.setQueryData<TEntry[]>(queryKey, apply(previous, input))
      return { previous }
    },
    onError: (_error, _input, context) => queryClient.setQueryData(queryKey, context?.previous ?? []),
    onSettled: () => queryClient.invalidateQueries({ queryKey }),
  })
}

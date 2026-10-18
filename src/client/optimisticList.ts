import { useMutation, useQueryClient } from '@tanstack/react-query'
import { localEngine } from './offline/localRuntime'

/** Applies a list change to the cached query at once, unless the device queues it durably and projects it itself. */
export function useOptimisticList<TEntry, TInput>(
  queryKey: readonly unknown[],
  mutationFn: (input: TInput) => Promise<unknown>,
  apply: (previous: TEntry[], input: TInput) => TEntry[],
) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn,
    onMutate: async (input) => {
      await queryClient.cancelQueries({ queryKey })
      if (localEngine()) return { durable: true, previous: [] as TEntry[] }
      const previous = queryClient.getQueryData<TEntry[]>(queryKey) ?? []
      queryClient.setQueryData<TEntry[]>(queryKey, apply(previous, input))
      return { durable: false, previous }
    },
    onError: (_error, _input, context) => {
      if (!context?.durable) queryClient.setQueryData(queryKey, context?.previous ?? [])
    },
    onSettled: (_data, _error, _input, context) => {
      if (!context?.durable) return queryClient.invalidateQueries({ queryKey })
    },
  })
}

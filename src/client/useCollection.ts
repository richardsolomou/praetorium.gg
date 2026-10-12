import { useMutation, useQueryClient } from '@tanstack/react-query'
import { setCollectionModels, setOwned } from './functions'
import { collectionCountsQuery, collectionQuery } from './queries'
import { localEngine } from './offline/localRuntime'

export function useCollectionMutation() {
  const queryClient = useQueryClient()
  const queryKey = collectionQuery().queryKey
  return useMutation({
    mutationFn: (input: { entryId: string; owned: boolean }) => setOwned({ data: input }),
    onMutate: async ({ entryId, owned }) => {
      await queryClient.cancelQueries({ queryKey })
      if (localEngine()) return { durable: true, wasOwned: false }
      const previous = queryClient.getQueryData<string[]>(queryKey)
      queryClient.setQueryData<string[]>(queryKey, (current = []) =>
        owned ? [...new Set([...current, entryId])] : current.filter((id) => id !== entryId),
      )
      // The server deletes a removed datasheet's count, so adding it back starts again at one.
      if (!owned)
        queryClient.setQueryData<Record<string, number>>(collectionCountsQuery().queryKey, (current) => {
          if (!current) return current
          const { [entryId]: _removed, ...rest } = current
          return rest
        })
      return { durable: false, wasOwned: previous?.includes(entryId) ?? false }
    },
    onError: (_error, { entryId }, context) => {
      if (context?.durable) return
      queryClient.setQueryData<string[]>(queryKey, (current = []) =>
        context?.wasOwned ? [...new Set([...current, entryId])] : current.filter((id) => id !== entryId),
      )
    },
    onSettled: (_data, _error, _input, context) => {
      if (context?.durable) return
      return Promise.all([
        queryClient.invalidateQueries({ queryKey }),
        queryClient.invalidateQueries({ queryKey: collectionCountsQuery().queryKey }),
      ])
    },
  })
}

export function useCollectionCountMutation() {
  const queryClient = useQueryClient()
  const queryKey = collectionCountsQuery().queryKey
  return useMutation({
    scope: { id: 'collection-counts' },
    mutationFn: (input: { entryId: string; models: number }) => setCollectionModels({ data: input }),
    onMutate: async ({ entryId, models }) => {
      await queryClient.cancelQueries({ queryKey })
      if (localEngine()) return { durable: true, previous: undefined }
      const previous = queryClient.getQueryData<Record<string, number>>(queryKey)
      queryClient.setQueryData<Record<string, number>>(queryKey, (current = {}) => ({ ...current, [entryId]: models }))
      return { durable: false, previous }
    },
    onError: (_error, _input, context) => {
      if (!context?.durable) queryClient.setQueryData(queryKey, context?.previous)
    },
    onSettled: (_data, _error, _input, context) => {
      if (!context?.durable) return queryClient.invalidateQueries({ queryKey })
    },
  })
}

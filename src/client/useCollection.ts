import { useMutation, useQueryClient } from '@tanstack/react-query'
import { setOwned } from '../server/functions'
import { collectionQuery } from './queries'

export function useCollectionMutation() {
  const queryClient = useQueryClient()
  const queryKey = collectionQuery().queryKey
  return useMutation({
    mutationFn: (input: { entryId: string; owned: boolean }) => setOwned({ data: input }),
    onMutate: async ({ entryId, owned }) => {
      await queryClient.cancelQueries({ queryKey })
      const previous = queryClient.getQueryData<string[]>(queryKey)
      queryClient.setQueryData<string[]>(queryKey, (current = []) =>
        owned ? [...new Set([...current, entryId])] : current.filter((id) => id !== entryId),
      )
      return { wasOwned: previous?.includes(entryId) ?? false }
    },
    onError: (_error, { entryId }, context) =>
      queryClient.setQueryData<string[]>(queryKey, (current = []) =>
        context?.wasOwned ? [...new Set([...current, entryId])] : current.filter((id) => id !== entryId),
      ),
    onSettled: () => queryClient.invalidateQueries({ queryKey }),
  })
}

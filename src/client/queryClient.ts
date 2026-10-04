import { MutationCache, QueryClient } from '@tanstack/react-query'

export function createQueryClient() {
  const client = new QueryClient({
    defaultOptions: { queries: { staleTime: 1000 } },
    // Onboarding progress is folded from rows anything can write, so any successful write may have finished a task.
    mutationCache: new MutationCache({ onSuccess: () => void client.invalidateQueries({ queryKey: ['onboarding'] }) }),
  })
  return client
}

export function errorMessage(error: unknown, fallback = 'Something went wrong. Try again.') {
  return error instanceof Error && error.message ? error.message : fallback
}

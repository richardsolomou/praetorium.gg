import { MutationCache } from '@tanstack/react-query'
import { createStackQueryClient, queryErrorMessage } from 'ras-stack/tanstack/query'

export function createQueryClient() {
  const client = createStackQueryClient({
    // Onboarding progress is folded from rows anything can write, so any successful write may have finished a task.
    mutationCache: new MutationCache({ onSuccess: () => void client.invalidateQueries({ queryKey: ['onboarding'] }) }),
  })
  return client
}

export const errorMessage = queryErrorMessage

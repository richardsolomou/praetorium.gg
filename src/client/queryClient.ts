import { QueryClient } from '@tanstack/react-query'

export function createQueryClient() {
  return new QueryClient({ defaultOptions: { queries: { staleTime: 1000 } } })
}

export function errorMessage(error: unknown) {
  return error instanceof Error && error.message ? error.message : 'Something went wrong. Try again.'
}

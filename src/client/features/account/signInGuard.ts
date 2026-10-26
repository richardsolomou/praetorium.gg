import type { QueryClient } from '@tanstack/react-query'
import { meQuery } from '../../queries'

export async function signedInDestination(queryClient: QueryClient, next?: string) {
  const account = await queryClient.query({ ...meQuery(), staleTime: 0 })
  return account ? (next ?? '/') : undefined
}

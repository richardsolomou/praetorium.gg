import type { QueryClient } from '@tanstack/react-query'
import { meQuery } from './queries'

type AccountQuery = ReturnType<typeof meQuery>

export async function signedInDestination(queryClient: QueryClient, next?: string, fetchAccount?: AccountQuery['queryFn']) {
  const account = await queryClient.fetchQuery({
    ...meQuery(),
    ...(fetchAccount ? { queryFn: fetchAccount } : {}),
    staleTime: 0,
  })
  return account ? (next ?? '/') : undefined
}

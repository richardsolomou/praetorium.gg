import { createFileRoute } from '@tanstack/react-router'
import { meQuery } from '../client/queries'

export const Route = createFileRoute('/groups')({
  loader: ({ context }) => context.queryClient.query({ ...meQuery(), staleTime: 'static' }),
})

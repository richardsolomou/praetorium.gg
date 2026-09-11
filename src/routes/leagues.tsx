import { createFileRoute, Outlet } from '@tanstack/react-router'
import { meQuery } from '../client/queries'

export const Route = createFileRoute('/leagues')({
  loader: ({ context }) => context.queryClient.query({ ...meQuery(), staleTime: 'static' }),
  component: Outlet,
})

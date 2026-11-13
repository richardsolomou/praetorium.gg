import { createFileRoute } from '@tanstack/react-router'
import { NotificationsPage } from '../client/features/notifications/NotificationsPage'
import { meQuery, noticesQuery } from '../client/queries'

export const Route = createFileRoute('/notifications')({
  loader: ({ context }) =>
    Promise.all([
      context.queryClient.query({ ...meQuery(), staleTime: 'static' }),
      context.queryClient.query({ ...noticesQuery(), staleTime: 'static' }),
    ]),
  component: NotificationsPage,
})

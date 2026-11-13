import { createFileRoute } from '@tanstack/react-router'
import { Status } from '../client/features/legal/Status'
import { pageHead } from '../client/linkPreview'

export const Route = createFileRoute('/status')({
  head: ({ match }) =>
    pageHead(match.context.origin, {
      title: 'Status',
      description: 'Whether Praetorium is working, and which release, army data and rules versions it serves.',
      path: '/status',
    }),
  component: Status,
})

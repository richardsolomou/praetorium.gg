import { createFileRoute } from '@tanstack/react-router'
import { STATUS_DESCRIPTION } from '../contracts/serviceStatus'
import { Status } from '../client/features/legal/Status'
import { pageHead } from '../client/linkPreview'

export const Route = createFileRoute('/status')({
  head: ({ match }) =>
    pageHead(match.context.origin, {
      title: 'Status',
      description: STATUS_DESCRIPTION,
      path: '/status',
    }),
  component: Status,
})

import { createFileRoute } from '@tanstack/react-router'
import { Support } from '../client/features/legal/Support'
import { pageHead } from '../client/linkPreview'

export const Route = createFileRoute('/support')({
  head: ({ match }) =>
    pageHead(match.context.origin, {
      title: 'Support',
      description: 'Get help with Praetorium, report a problem, or recover your account.',
      path: '/support',
    }),
  component: Support,
})

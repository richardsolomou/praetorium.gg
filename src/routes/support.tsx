import { createFileRoute } from '@tanstack/react-router'
import { Support } from '../client/features/legal/Support'
import { pageHead } from '../client/linkPreview'

export const Route = createFileRoute('/support')({
  head: ({ match }) =>
    pageHead(match.context.origin, {
      title: 'Support',
      description: 'Get help with the Praetorium web, iOS, and Android applications.',
      path: '/support',
    }),
  component: Support,
})

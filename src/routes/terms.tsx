import { createFileRoute } from '@tanstack/react-router'
import { Terms } from '../client/features/legal/Terms'
import { pageHead } from '../client/linkPreview'

export const Route = createFileRoute('/terms')({
  head: ({ match }) =>
    pageHead(match.context.origin, {
      title: 'Terms of service',
      description: 'The terms that govern using praetorium.gg: accounts, acceptable use, your lists, and liability.',
      path: '/terms',
    }),
  component: Terms,
})

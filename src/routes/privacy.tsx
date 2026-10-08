import { createFileRoute } from '@tanstack/react-router'
import { PrivacyPolicy } from '../client/features/legal/PrivacyPolicy'
import { pageHead } from '../client/linkPreview'

export const Route = createFileRoute('/privacy')({
  head: ({ match }) =>
    pageHead(match.context.origin, {
      title: 'Privacy policy',
      description: 'What Praetorium collects, who can see your lists and battles, and how to have it deleted.',
      path: '/privacy',
    }),
  component: PrivacyPolicy,
})

import { createFileRoute } from '@tanstack/react-router'
import { DocsPage } from '../client/features/docs/DocsPage'
import { pageHead } from '../client/linkPreview'

export const Route = createFileRoute('/docs/')({
  head: ({ match }) =>
    pageHead(match.context.origin, {
      title: 'Praetorium docs',
      description: 'How to build and import Warhammer 40,000 army lists, compare loadouts, track battles and connect an AI assistant.',
      path: '/docs',
    }),
  component: DocsPage,
})

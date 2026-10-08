import { createFileRoute } from '@tanstack/react-router'
import { Sources } from '../client/features/legal/Sources'
import { pageHead } from '../client/linkPreview'

export const Route = createFileRoute('/sources')({
  head: ({ match }) =>
    pageHead(match.context.origin, {
      title: 'Data sources',
      description: 'The community data sources, licences, attribution, and trademark notice for Praetorium.',
      path: '/sources',
    }),
  component: Sources,
})

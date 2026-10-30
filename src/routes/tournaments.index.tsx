import { createFileRoute } from '@tanstack/react-router'
import { SealedEventIndex } from '../client/features/sealedEvents/SealedEventIndex'
import { pageHead } from '../client/linkPreview'
import { sealedEventsQuery } from '../client/queries'

export const Route = createFileRoute('/tournaments/')({
  loader: ({ context }) => context.queryClient.query({ ...sealedEventsQuery(), staleTime: 'static' }),
  head: ({ match }) =>
    pageHead(match.context.origin, {
      title: 'Tournaments',
      description: 'Collect sealed rosters for a tournament, then reveal every accepted list together.',
      path: '/tournaments',
    }),
  component: SealedEventIndex,
})

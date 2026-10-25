import { createFileRoute } from '@tanstack/react-router'
import { ClubIndex } from '../client/features/clubs/ClubIndex'
import { pageHead } from '../client/linkPreview'
import { clubsQuery } from '../client/queries'

export const Route = createFileRoute('/clubs/')({
  loader: ({ context }) => context.queryClient.query({ ...clubsQuery(), staleTime: 'static' }),
  head: ({ match }) =>
    pageHead(match.context.origin, {
      title: 'Clubs',
      description: 'A permanent leaderboard for your club or friend group, rating the battles members play each other.',
      path: '/clubs',
    }),
  component: ClubIndex,
})

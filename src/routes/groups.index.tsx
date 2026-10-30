import { createFileRoute } from '@tanstack/react-router'
import { GroupIndex } from '../client/features/groups/GroupIndex'
import { pageHead } from '../client/linkPreview'
import { groupsQuery } from '../client/queries'

export const Route = createFileRoute('/groups/')({
  // Events opens here, so a device offline before it ever read its groups still reaches the page and its tabs.
  loader: ({ context }) => context.queryClient.query({ ...groupsQuery(), staleTime: 'static' }).catch(() => null),
  head: ({ match }) =>
    pageHead(match.context.origin, {
      title: 'Groups',
      description: 'A permanent leaderboard for your group or friend group, rating the battles members play each other.',
      path: '/groups',
    }),
  component: GroupIndex,
})

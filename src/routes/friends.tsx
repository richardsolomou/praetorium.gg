import { createFileRoute } from '@tanstack/react-router'
import { FriendsPage } from '../client/features/friends/FriendsPage'
import { activeFriendInviteQuery, friendshipsQuery, meQuery } from '../client/queries'

export const Route = createFileRoute('/friends')({
  loader: ({ context }) =>
    Promise.all([
      context.queryClient.query({ ...meQuery(), staleTime: 'static' }),
      context.queryClient.query({ ...friendshipsQuery(), staleTime: 'static' }),
      context.queryClient.query({ ...activeFriendInviteQuery(), staleTime: 'static' }),
    ]),
  component: FriendsPage,
})

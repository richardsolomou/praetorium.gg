import { createFileRoute, notFound } from '@tanstack/react-router'
import { FriendInvitePage } from '../client/features/friends/FriendInvitePage'
import { friendInviteQuery } from '../client/queries'

export const Route = createFileRoute('/invite/$token')({
  loader: async ({ context, params }) => {
    const invite = await context.queryClient.query({ ...friendInviteQuery(params.token), staleTime: 'static' })
    if (!invite) throw notFound()
  },
  head: () => ({
    meta: [
      { title: 'Friend invite — Praetorium' },
      { name: 'description', content: 'Accept an invitation to join a friend on Praetorium.' },
    ],
  }),
  component: () => <FriendInvitePage token={Route.useParams().token} />,
})

import { createFileRoute, notFound } from '@tanstack/react-router'
import { UserX } from 'lucide-react'
import { PageState } from '../client/components/PageState'
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
  notFoundComponent: () => (
    <main className="flex w-full">
      <PageState
        className="flex-1 border-x-0 border-t-0"
        eyebrow="Friend invite"
        title="This invite link no longer works"
        explanation="It has expired, been used or been cancelled. Ask your friend for a new link."
        icon={UserX}
      />
    </main>
  ),
})

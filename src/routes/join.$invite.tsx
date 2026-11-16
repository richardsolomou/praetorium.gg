import { createFileRoute, notFound, redirect } from '@tanstack/react-router'
import { UserX } from 'lucide-react'
import { FullPageState } from '../client/components/PageState'
import { guestInviteBattle } from '../client/functions'

/** A guest seat's link, from before every seat needed an account: it opens the battle to watch. */
export const Route = createFileRoute('/join/$invite')({
  beforeLoad: async ({ params }) => {
    const token = await guestInviteBattle({ data: { invite: params.invite } })
    if (!token) throw notFound()
    throw redirect({ to: '/battles/$token', params: { token }, replace: true })
  },
  notFoundComponent: () => (
    <FullPageState title="This link no longer works" explanation="The battle it was made for has been deleted." icon={UserX} />
  ),
})

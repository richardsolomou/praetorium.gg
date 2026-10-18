import { createFileRoute, notFound } from '@tanstack/react-router'
import { UserX } from 'lucide-react'
import { FullPageState } from '../client/components/PageState'
import { pageMeta } from '../client/linkPreview'
import { JoinAsGuest } from '../client/features/battles/JoinAsGuest'
import { guestInvitationQuery } from '../client/queries'

export const Route = createFileRoute('/join/$invite')({
  loader: async ({ context, params }) => {
    const invitation = await context.queryClient.query({ ...guestInvitationQuery(params.invite), staleTime: 'static' })
    if (!invitation) throw notFound()
  },
  head: ({ match }) => ({
    meta: pageMeta(match.context.origin, {
      title: 'Guest seat',
      description: 'Play your side of a Warhammer 40,000 battle on Praetorium, without an account.',
    }),
  }),
  component: () => <JoinAsGuest invite={Route.useParams().invite} />,
  notFoundComponent: () => (
    <FullPageState
      eyebrow="Guest seat"
      title="This link no longer works"
      explanation="The battle was deleted, or its host made a new link. Ask them to share it again."
      icon={UserX}
    />
  ),
})

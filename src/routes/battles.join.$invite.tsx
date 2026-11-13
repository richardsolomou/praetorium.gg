import { createFileRoute, notFound } from '@tanstack/react-router'
import { UserX } from 'lucide-react'
import { FullPageState } from '../client/components/PageState'
import { pageMeta } from '../client/linkPreview'
import { JoinBattle } from '../client/features/battles/JoinBattle'
import { battleInvitationQuery } from '../client/queries'

export const Route = createFileRoute('/battles/join/$invite')({
  loader: async ({ context, params }) => {
    const invitation = await context.queryClient.query(battleInvitationQuery(params.invite))
    if (!invitation) throw notFound()
  },
  head: ({ match }) => ({
    meta: pageMeta(match.context.origin, {
      title: 'Join a battle',
      description: 'Join a Warhammer 40,000 battle on Praetorium.',
    }),
  }),
  component: () => <JoinBattle invite={Route.useParams().invite} />,
  notFoundComponent: () => (
    <FullPageState
      title="This link no longer works"
      explanation="The battle was deleted, or everyone has joined it. Ask whoever sent it for a new link."
      icon={UserX}
    />
  ),
})

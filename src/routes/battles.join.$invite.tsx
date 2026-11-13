import { createFileRoute, notFound } from '@tanstack/react-router'
import { UserX } from 'lucide-react'
import { FullPageState } from '../client/components/PageState'
import { pageMeta } from '../client/linkPreview'
import { JoinBattle } from '../client/features/battles/JoinBattle'
import { battleInvitationQuery } from '../client/queries'

export const Route = createFileRoute('/battles/join/$invite')({
  // The side a visitor chose before signing in, which joins them as soon as they are back.
  validateSearch: (search: Record<string, unknown>): { side?: 0 | 1 } =>
    search.side === 0 || search.side === 1 ? { side: search.side } : {},
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
  component: () => <JoinBattle invite={Route.useParams().invite} side={Route.useSearch().side} />,
  notFoundComponent: () => (
    <FullPageState
      title="This link no longer works"
      explanation="The battle was deleted, or everyone has joined it. Ask whoever sent it for a new link."
      icon={UserX}
    />
  ),
})

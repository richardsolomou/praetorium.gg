import { createFileRoute, notFound, redirect } from '@tanstack/react-router'
import { sealedEventQuery } from '../client/queries'

/** A group's hidden-list game is played on its group's page, so its own address, used by links and notifications, opens it there. */
export const Route = createFileRoute('/groups/$token_/games/$game')({
  loader: async ({ context, params }) => {
    const sealedEvent = await context.queryClient.query({ ...sealedEventQuery(params.game), staleTime: 'static' })
    if (!sealedEvent) throw notFound()
    if (!sealedEvent.group) throw redirect({ to: '/tournaments/$token', params: { token: sealedEvent.token }, replace: true })
    throw redirect({
      to: '/groups/$token',
      params: { token: sealedEvent.group.token },
      search: { game: sealedEvent.token },
      hash: `game-${sealedEvent.token}`,
      replace: true,
    })
  },
})

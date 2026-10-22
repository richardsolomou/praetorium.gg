import { createFileRoute, Outlet, useRouterState } from '@tanstack/react-router'
import { ForceDispositionIndexPage } from '../client/features/reference/missions/ForceDispositionIndexPage'
import { dispositionDetachmentsQuery, gameReferencesQuery } from '../client/queries'
import { pageHead } from '../client/linkPreview'

export const Route = createFileRoute('/force-dispositions')({
  loader: async ({ context, location }) => {
    if (location.pathname !== '/force-dispositions') return
    const data = await context.queryClient.query({ ...gameReferencesQuery(), staleTime: 'static' })
    await Promise.all(
      (data?.dispositions ?? []).map((disposition) =>
        context.queryClient.query({ ...dispositionDetachmentsQuery(disposition.id), staleTime: 'static' }),
      ),
    )
  },
  head: ({ match, matches }) =>
    matches.at(-1)?.routeId === match.routeId
      ? pageHead(match.context.origin, {
          title: 'Force dispositions',
          description: 'Explore force dispositions and the primary missions they bring to a battle.',
          path: '/force-dispositions',
        })
      : {},
  component: ForceDispositions,
})

function ForceDispositions() {
  const path = useRouterState({ select: (state) => state.location.pathname })
  return path === '/force-dispositions' ? <ForceDispositionIndexPage /> : <Outlet />
}

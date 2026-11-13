import { createFileRoute } from '@tanstack/react-router'
import { StreamOverlay } from '../client/features/battle/StreamOverlay'
import { battleQuery, factionQuery } from '../client/queries'

export const Route = createFileRoute('/battles/$token_/overlay')({
  loader: async ({ context, params }) => {
    const screen = await context.queryClient.query({ ...battleQuery(params.token), staleTime: 'static' })
    if (!screen || screen.kind === 'unavailable') return
    await Promise.all(
      [...new Set(screen.view.players.flatMap((player) => (player.roster?.built ? [player.roster.built.catalogueId] : [])))].map(
        (catalogueId) => context.queryClient.query({ ...factionQuery(catalogueId), staleTime: 'static' }),
      ),
    )
  },
  head: () => ({ meta: [{ title: 'Stream overlay — Praetorium' }, { name: 'robots', content: 'noindex' }] }),
  component: OverlayRoute,
})

function OverlayRoute() {
  const { token } = Route.useParams()
  return <StreamOverlay key={token} token={token} />
}

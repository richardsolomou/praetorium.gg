import { createFileRoute, notFound } from '@tanstack/react-router'
import { BattlePage } from '../client/features/battle/BattlePage'
import {
  battleQuery,
  deploymentsQuery,
  detachmentRulesQuery,
  factionQuery,
  gameReferencesQuery,
  terrainMatchupIds,
  terrainReferencesQuery,
} from '../client/queries'
import { battlePreview, hiddenBattle, pageMeta } from '../client/linkPreview'
import { armyRulesRequest } from '../client/features/battle/sideRules'

export const Route = createFileRoute('/battles/$token')({
  loader: async ({ context, params }) => {
    /*
     * What the instance itself holds does not depend on which battle this is, so
     * it is asked for alongside the battle rather than in a round after it. It is
     * started but not awaited here: a battle nobody may open needs none of it and
     * is not made to wait, and a seated player joins these promises below. Rejections are
     * swallowed because whatever actually reads one of these will observe its own
     * failure — a page that never looks must not bring down the loader.
     */
    const instanceData = [
      context.queryClient.query({ ...gameReferencesQuery(), staleTime: 'static' }),
      context.queryClient.query({ ...deploymentsQuery(), staleTime: 'static' }),
    ].map((pending) => pending.catch(() => undefined))
    // Only a loader may throw this: from a render it lands in the error boundary.
    const screen = await context.queryClient.query({ ...battleQuery(params.token), staleTime: 'static' })
    if (!screen) throw notFound()
    if (screen.kind === 'unavailable') return { preview: null }
    const dispositions = [...new Set(screen.view.players.map((player) => player.side))]
      .map((side) => screen.view.players.find((player) => player.side === side)?.disposition)
      .filter((value): value is string => Boolean(value))
    const matchupIds = terrainMatchupIds(dispositions)
    // The battle decides which independent reads are needed; start them together once it is known.
    await Promise.all([
      ...instanceData,
      ...(matchupIds.length ? [context.queryClient.query({ ...terrainReferencesQuery(matchupIds), staleTime: 'static' })] : []),
      ...screen.view.players.flatMap((player) => {
        const { catalogueId, detachmentNames } = armyRulesRequest(player.roster)
        return catalogueId && detachmentNames.length
          ? [context.queryClient.query({ ...detachmentRulesQuery(catalogueId, detachmentNames), staleTime: 'static' })]
          : []
      }),
      // Each army's own faction, instead of every faction the instance knows.
      ...[...new Set(screen.view.players.flatMap((player) => (player.roster?.built ? [player.roster.built.catalogueId] : [])))].map(
        (catalogueId) => context.queryClient.query({ ...factionQuery(catalogueId), staleTime: 'static' }),
      ),
    ])
    const factionName = (catalogueId: string) => context.queryClient.getQueryData(factionQuery(catalogueId).queryKey)?.displayName ?? null
    return { preview: battlePreview(screen.view, factionName) }
  },
  head: ({ loaderData, match, params }) => {
    const preview = loaderData?.preview
    const path = `/battles/${params.token}`
    return {
      meta: pageMeta(
        match.context.origin,
        preview
          ? { title: preview.title, description: preview.description, path, image: { path: `/api/previews${path}`, alt: preview.title } }
          : { ...hiddenBattle, path },
      ),
    }
  },
  component: BattleRoute,
})

function BattleRoute() {
  const { token } = Route.useParams()
  return <BattlePage key={token} token={token} />
}

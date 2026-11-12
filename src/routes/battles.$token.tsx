import { createFileRoute, notFound } from '@tanstack/react-router'
import { BattleNotFound } from '../client/features/battle/BattleNotFound'
import { BattlePage } from '../client/features/battle/BattlePage'
import { battleQuery, deploymentsQuery, factionQuery, gameReferencesQuery, terrainReferencesQuery } from '../client/queries'
import { battlePreview, hiddenBattle, pageMeta, previewImage } from '../client/linkPreview'
import { armyReads } from '../client/features/battle/sideRules'
import { battleMatchupIds } from '../client/features/battle/battlefieldLayout'

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
    // Only a seated player's setup and tracker draw terrain on arrival; a watched or finished battle reads it when its map opens.
    const matchupIds = screen.kind === 'battle' && screen.view.status !== 'finished' ? battleMatchupIds(screen.view) : []
    // The battle decides which independent reads are needed; start them together once it is known.
    await Promise.all([
      ...instanceData,
      ...(matchupIds.length ? [context.queryClient.query({ ...terrainReferencesQuery(matchupIds), staleTime: 'static' })] : []),
      ...armyReads(context.queryClient, screen.view),
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
          ? { title: preview.title, description: preview.description, path, image: previewImage(path, preview.title) }
          : { ...hiddenBattle, path },
      ),
    }
  },
  component: BattleRoute,
  notFoundComponent: () => <BattleNotFound token={Route.useParams().token} />,
})

function BattleRoute() {
  const { token } = Route.useParams()
  return <BattlePage key={token} token={token} />
}

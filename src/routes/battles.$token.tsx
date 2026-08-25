import { useQuery } from '@tanstack/react-query'
import { createFileRoute, Navigate, notFound } from '@tanstack/react-router'
import { Invitation } from '../client/components/Invitation'
import { Setup } from '../client/components/Setup'
import { Tracker } from '../client/components/Tracker'
import {
  battleQuery,
  deploymentsQuery,
  detachmentRulesQuery,
  factionQuery,
  gameReferencesQuery,
  terrainMatchupIds,
  terrainReferencesQuery,
} from '../client/queries'
import { armyRulesRequest } from '../client/sideRules'
import { useCommand } from '../client/useCommand'
import { useLiveBattle } from '../client/useLiveBattle'

export const Route = createFileRoute('/battles/$token')({
  loader: async ({ context, params }) => {
    /*
     * What the instance itself holds does not depend on which battle this is, so
     * it is asked for alongside the battle rather than in a round after it. It is
     * started but not awaited here: an invitation needs none of it and is not made
     * to wait, and a seated player joins these promises below. Rejections are
     * swallowed because whatever actually reads one of these will observe its own
     * failure — a page that never looks must not bring down the loader.
     */
    const instanceData = [
      context.queryClient.ensureQueryData(gameReferencesQuery()),
      context.queryClient.ensureQueryData(deploymentsQuery()),
    ].map((pending) => pending.catch(() => undefined))
    // Only a loader may throw this: from a render it lands in the error boundary.
    const screen = await context.queryClient.ensureQueryData(battleQuery(params.token))
    if (!screen) throw notFound()
    if (screen.kind !== 'battle') return
    const dispositions = [...new Set(screen.view.players.map((player) => player.side))]
      .map((side) => screen.view.players.find((player) => player.side === side)?.disposition)
      .filter((value): value is string => Boolean(value))
    const matchupIds = terrainMatchupIds(dispositions)
    // The battle decides which independent reads are needed; start them together once it is known.
    await Promise.all([
      ...instanceData,
      ...(matchupIds.length ? [context.queryClient.ensureQueryData(terrainReferencesQuery(matchupIds))] : []),
      ...screen.view.players.flatMap((player) => {
        const { catalogueId, detachmentNames } = armyRulesRequest(player.roster)
        return catalogueId && detachmentNames.length
          ? [context.queryClient.ensureQueryData(detachmentRulesQuery(catalogueId, detachmentNames))]
          : []
      }),
      // Each army's own faction, instead of every faction the instance knows.
      ...[...new Set(screen.view.players.flatMap((player) => (player.roster?.built ? [player.roster.built.catalogueId] : [])))].map(
        (catalogueId) => context.queryClient.ensureQueryData(factionQuery(catalogueId)),
      ),
    ])
  },
  component: BattlePage,
})

function BattlePage() {
  const { token } = Route.useParams()
  return <BattleSession key={token} token={token} />
}

function BattleSession({ token }: { token: string }) {
  const { data: screen } = useQuery(battleQuery(token))
  const seated = screen?.kind === 'battle'
  useLiveBattle(token, seated)
  const { send, attachSavedRoster, problem, pending } = useCommand(token, seated ? screen.view.seq : 0)

  if (!screen) return <Navigate to="/battles" replace />
  if (screen.kind === 'invitation') return <Invitation token={token} free={screen.free} />
  if (screen.view.status === 'setup')
    return (
      <Setup
        view={screen.view}
        mission={screen.mission}
        missions={screen.missions}
        send={send}
        attachSavedRoster={attachSavedRoster}
        pending={pending}
        problem={problem}
      />
    )
  return <Tracker view={screen.view} missions={screen.missions} send={send} pending={pending} problem={problem} />
}

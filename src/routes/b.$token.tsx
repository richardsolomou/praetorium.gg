import { useQuery } from '@tanstack/react-query'
import { createFileRoute, Navigate, notFound } from '@tanstack/react-router'
import { Invitation } from '../client/components/Invitation'
import { Setup } from '../client/components/Setup'
import { Tracker } from '../client/components/Tracker'
import {
  battleQuery,
  catalogueStatusQuery,
  collectionQuery,
  deploymentsQuery,
  detachmentRulesQuery,
  factionsQuery,
  gameReferencesQuery,
  savedRostersQuery,
  terrainMatchupIds,
  terrainReferencesQuery,
} from '../client/queries'
import { useCommand } from '../client/useCommand'
import { useLiveBattle } from '../client/useLiveBattle'

export const Route = createFileRoute('/b/$token')({
  loader: async ({ context, params }) => {
    // Only a loader may throw this: from a render it lands in the error boundary.
    const screen = await context.queryClient.ensureQueryData(battleQuery(params.token))
    if (!screen) throw notFound()
    if (screen.kind === 'battle') {
      await Promise.all([
        context.queryClient.ensureQueryData(factionsQuery()),
        context.queryClient.ensureQueryData(gameReferencesQuery()),
        context.queryClient.ensureQueryData(catalogueStatusQuery()),
        context.queryClient.ensureQueryData(deploymentsQuery()),
        context.queryClient.ensureQueryData(savedRostersQuery()),
        context.queryClient.ensureQueryData(collectionQuery()),
      ])
      const built = screen.view.players.find((player) => player.isViewer)?.roster?.built
      const dispositions = screen.view.players
        .map((player) => player.roster?.built?.disposition)
        .filter((value): value is string => Boolean(value))
      const matchupIds = terrainMatchupIds(dispositions, screen.view.settings.solo)
      if (matchupIds.length) await context.queryClient.ensureQueryData(terrainReferencesQuery(matchupIds))
      const detachmentNames = built?.detachments?.map((detachment) => detachment.name) ?? (built?.detachment ? [built.detachment] : [])
      if (built?.catalogueId && detachmentNames.length) {
        await context.queryClient.ensureQueryData(detachmentRulesQuery(built.catalogueId, detachmentNames))
      }
    }
  },
  component: BattlePage,
})

function BattlePage() {
  const { token } = Route.useParams()
  const { data: screen } = useQuery(battleQuery(token))
  const seated = screen?.kind === 'battle'
  const present = useLiveBattle(token, seated)
  const { send, problem, pending } = useCommand(token, seated ? screen.view.seq : 0)

  if (!screen) return <Navigate to="/battles" replace />
  if (screen.kind === 'invitation') return <Invitation token={token} free={screen.free} />
  if (screen.view.status === 'setup')
    return <Setup view={screen.view} mission={screen.mission} send={send} pending={pending} problem={problem} />
  return <Tracker view={screen.view} mission={screen.mission} present={present} send={send} pending={pending} problem={problem} />
}

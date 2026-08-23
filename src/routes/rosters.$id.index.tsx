import { useQuery } from '@tanstack/react-query'
import { createFileRoute, notFound } from '@tanstack/react-router'
import { useEffect } from 'react'
import { fieldedRoster } from '../client/battleRosterSnapshot'
import { BattleRosterSnapshot } from '../client/components/BattleRosterSnapshot'
import { RosterEditor } from '../client/components/RosterEditor'
import {
  battleQuery,
  collectionQuery,
  factionsQuery,
  savedRosterPriceQuery,
  savedRostersQuery,
  sharedRosterQuery,
  unitsQuery,
} from '../client/queries'
import { normalisePicks } from '../client/rosterPicks'

export const Route = createFileRoute('/rosters/$id/')({
  // A battle token is what lets a seated opponent open a list that is otherwise private.
  validateSearch: (search: Record<string, unknown>): { battle?: string; print?: boolean } => ({
    ...(typeof search.battle === 'string' ? { battle: search.battle } : {}),
    ...(search.print === true || search.print === 'true' ? { print: true } : {}),
  }),
  loaderDeps: ({ search }) => ({ battle: search.battle }),
  loader: async ({ context, params, deps }) => {
    if (deps.battle) {
      const screen = await context.queryClient.ensureQueryData(battleQuery(deps.battle))
      if (!screen || screen.kind !== 'battle' || !fieldedRoster(screen.view, params.id)) throw notFound()
      return { editable: false, snapshot: true }
    }
    /*
     * Who is asking, what they are asking for, and the factions, all at once.
     *
     * None of the three depends on the others — the reads resolve the viewer
     * themselves, and a signed-out one is answered with no lists rather than
     * having to be asked about first — so waiting on the account before starting
     * put a round trip in front of the page for nothing.
     */
    const [, shared, saved] = await Promise.all([
      context.queryClient.ensureQueryData(factionsQuery()),
      context.queryClient.ensureQueryData(sharedRosterQuery(params.id, deps.battle)),
      context.queryClient.ensureQueryData(savedRostersQuery()),
    ])
    const owned = saved.find((candidate) => candidate.id === params.id)
    const roster = owned ?? shared
    if (!roster) throw notFound()

    await Promise.all([
      context.queryClient.ensureQueryData(
        savedRosterPriceQuery(
          roster.id,
          roster.catalogueId,
          roster.detachmentIds,
          roster.disposition,
          roster.limit,
          normalisePicks(roster.picks),
          deps.battle,
        ),
      ),
      ...(owned
        ? [context.queryClient.ensureQueryData(collectionQuery()), context.queryClient.ensureQueryData(unitsQuery(roster.catalogueId, ''))]
        : []),
    ])
    return { editable: Boolean(owned), snapshot: false }
  },
  component: RosterPage,
})

function RosterPage() {
  const { id } = Route.useParams()
  const { battle, print } = Route.useSearch()
  const { editable, snapshot } = Route.useLoaderData()
  const { data: screen } = useQuery({ ...battleQuery(battle ?? ''), enabled: snapshot && Boolean(battle) })
  const { data: shared } = useQuery({ ...sharedRosterQuery(id, battle), enabled: !snapshot })
  const { data: saved = [] } = useQuery({ ...savedRostersQuery(), enabled: editable })
  const roster = saved.find((candidate) => candidate.id === id) ?? shared

  useEffect(() => {
    if (print) window.print()
  }, [print])

  if (snapshot && battle && screen?.kind === 'battle') {
    const fielded = fieldedRoster(screen.view, id)
    return fielded ? <BattleRosterSnapshot roster={fielded} /> : null
  }
  if (!roster) return null
  return <RosterEditor roster={roster} editable={editable} battle={battle} />
}

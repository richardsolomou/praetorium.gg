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
  leagueRosterQuery,
  savedRosterPriceQuery,
  savedRostersQuery,
  sharedRosterQuery,
  unitsQuery,
} from '../client/queries'
import { normalisePicks } from '../client/rosterPicks'

export const Route = createFileRoute('/rosters/$id/')({
  // A battle token is what lets a seated opponent open a list that is otherwise private.
  validateSearch: (search: Record<string, unknown>): { battle?: string; league?: string; event?: string; print?: boolean } => ({
    ...(typeof search.battle === 'string' ? { battle: search.battle } : {}),
    ...(typeof search.league === 'string' ? { league: search.league } : {}),
    ...(typeof search.event === 'string' ? { event: search.event } : {}),
    ...(search.print === true || search.print === 'true' ? { print: true } : {}),
  }),
  loaderDeps: ({ search }) => ({ battle: search.battle, league: search.league, event: search.event }),
  loader: async ({ context, params, deps }) => {
    if (deps.league) {
      const roster = await context.queryClient.ensureQueryData(leagueRosterQuery(deps.league, deps.event, params.id))
      if (!roster) throw notFound()
      return { editable: false, snapshot: true, league: true }
    }
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
        ? [
            context.queryClient.ensureQueryData(collectionQuery()),
            context.queryClient.ensureQueryData(unitsQuery(roster.catalogueId, '', roster.limit)),
          ]
        : []),
    ])
    return { editable: Boolean(owned), snapshot: false }
  },
  component: RosterPage,
})

function RosterPage() {
  const { id } = Route.useParams()
  const { battle, league, event, print } = Route.useSearch()
  const { editable, snapshot, league: leagueSnapshot } = Route.useLoaderData()
  const { data: screen } = useQuery({ ...battleQuery(battle ?? ''), enabled: snapshot && Boolean(battle) })
  const { data: sealed } = useQuery({
    ...leagueRosterQuery(league ?? '', event ?? '', id),
    enabled: Boolean(leagueSnapshot && league),
  })
  const { data: shared } = useQuery({ ...sharedRosterQuery(id, battle), enabled: !snapshot })
  const { data: saved = [] } = useQuery({ ...savedRostersQuery(), enabled: editable })
  const roster = saved.find((candidate) => candidate.id === id) ?? shared

  useEffect(() => {
    if (print) window.print()
  }, [print])

  if (leagueSnapshot) return sealed ? <BattleRosterSnapshot roster={sealed} /> : null
  if (snapshot && battle && screen?.kind === 'battle') {
    const fielded = fieldedRoster(screen.view, id)
    return fielded ? <BattleRosterSnapshot roster={fielded} /> : null
  }
  if (!roster) return null
  return <RosterEditor roster={roster} editable={editable} battle={battle} />
}

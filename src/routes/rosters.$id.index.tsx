import { useQuery, type QueryClient } from '@tanstack/react-query'
import { createFileRoute, notFound } from '@tanstack/react-router'
import { useEffect } from 'react'
import type { Roster } from '../core/battle'
import { fieldedRoster } from '../client/battleRosterSnapshot'
import { BattleRosterSnapshot } from '../client/components/BattleRosterSnapshot'
import { RosterEditor } from '../client/components/RosterEditor'
import {
  battleQuery,
  factionIndexQuery,
  factionQuery,
  leagueRosterQuery,
  priceQuery,
  rosterAccessQuery,
  savedRosterPriceQuery,
} from '../client/queries'
import { normalisePicks } from '../client/rosterPicks'
import { rosterBootstrap } from '../server/functions'

export const Route = createFileRoute('/rosters/$id/')({
  // A battle token is what lets an entitled battle reader open a list that is otherwise private.
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
      await preloadSnapshot(context.queryClient, roster)
      return { editable: false, snapshot: true, league: true }
    }
    if (deps.battle) {
      const screen = await context.queryClient.ensureQueryData(battleQuery(deps.battle))
      if (!screen || screen.kind === 'invitation') throw notFound()
      const roster = fieldedRoster(screen.view, params.id)
      if (!roster) throw notFound()
      await preloadSnapshot(context.queryClient, roster)
      return { editable: false, snapshot: true }
    }
    const [, bootstrap] = await Promise.all([
      context.queryClient.ensureQueryData(factionIndexQuery()),
      rosterBootstrap({ data: { id: params.id, ...(deps.battle ? { battle: deps.battle } : {}) } }),
    ])
    if (!bootstrap) throw notFound()
    const { roster, editable, faction, price } = bootstrap
    const access = { roster, editable, faction }
    context.queryClient.setQueryData(rosterAccessQuery(params.id, deps.battle).queryKey, access)
    const priced = savedRosterPriceQuery(
      roster.id,
      roster.catalogueId,
      roster.detachmentIds,
      roster.disposition,
      roster.limit,
      normalisePicks(roster.picks),
      deps.battle,
    )
    context.queryClient.setQueryData(priced.queryKey, price)
    return { editable, snapshot: false }
  },
  component: RosterPage,
})

async function preloadSnapshot(queryClient: QueryClient, roster: Roster) {
  const built = roster.built
  if (!built) return
  await Promise.all([
    queryClient.ensureQueryData(factionQuery(built.catalogueId)).catch(() => undefined),
    ...(roster.id && built.detachmentIds && built.picks
      ? [
          queryClient
            .ensureQueryData(priceQuery(built.catalogueId, built.detachmentIds, built.disposition, built.limit, built.picks))
            .catch(() => undefined),
        ]
      : []),
  ])
}

function RosterPage() {
  const { id } = Route.useParams()
  const { battle, league, event, print } = Route.useSearch()
  const { editable, snapshot, league: leagueSnapshot } = Route.useLoaderData()
  const { data: screen } = useQuery({ ...battleQuery(battle ?? ''), enabled: snapshot && Boolean(battle) })
  const { data: sealed } = useQuery({
    ...leagueRosterQuery(league ?? '', event ?? '', id),
    enabled: Boolean(leagueSnapshot && league),
  })
  const { data: access } = useQuery({ ...rosterAccessQuery(id, battle), enabled: !snapshot })
  const roster = access?.roster

  useEffect(() => {
    if (print) window.print()
  }, [print])

  if (leagueSnapshot) return sealed ? <BattleRosterSnapshot roster={sealed} /> : null
  if (snapshot && battle && screen && screen.kind !== 'invitation') {
    const fielded = fieldedRoster(screen.view, id)
    return fielded ? <BattleRosterSnapshot roster={fielded} /> : null
  }
  if (!roster) return null
  return <RosterEditor roster={roster} faction={access.faction} editable={editable} battle={battle} />
}

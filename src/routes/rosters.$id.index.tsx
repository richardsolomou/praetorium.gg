import { useQuery } from '@tanstack/react-query'
import { createFileRoute, notFound } from '@tanstack/react-router'
import { useEffect } from 'react'
import { fieldedRoster } from '../client/battleRosterSnapshot'
import { BattleRosterSnapshot } from '../client/components/BattleRosterSnapshot'
import { RosterEditor } from '../client/components/RosterEditor'
import { battleQuery, factionsQuery, leagueRosterQuery, rosterAccessQuery, savedRosterPriceQuery } from '../client/queries'
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
    const [, access] = await Promise.all([
      context.queryClient.ensureQueryData(factionsQuery()),
      context.queryClient.ensureQueryData(rosterAccessQuery(params.id, deps.battle)),
    ])
    if (!access) throw notFound()
    const { roster, editable, price } = access
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
  if (snapshot && battle && screen?.kind === 'battle') {
    const fielded = fieldedRoster(screen.view, id)
    return fielded ? <BattleRosterSnapshot roster={fielded} /> : null
  }
  if (!roster) return null
  return <RosterEditor roster={roster} editable={editable} battle={battle} />
}

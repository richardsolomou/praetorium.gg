import { createFileRoute, notFound } from '@tanstack/react-router'
import { fieldedRoster } from '../client/features/rosters/fieldedRoster'
import { RosterPage } from '../client/features/rosters/RosterPage'
import { battleQuery, leagueRosterQuery, rosterAccessQuery, rosterChangesQuery, savedRosterPriceQuery } from '../client/queries'
import { pageMeta, rosterExposure, rosterPreview } from '../client/linkPreview'
import { normalisePicks } from '../client/features/rosters/rosterPicks'
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
      const roster = await context.queryClient.query({ ...leagueRosterQuery(deps.league, deps.event, params.id), staleTime: 'static' })
      if (!roster) throw notFound()
      return { editable: false, snapshot: true, league: true }
    }
    if (deps.battle) {
      const screen = await context.queryClient.query({ ...battleQuery(deps.battle), staleTime: 'static' })
      if (!screen || screen.kind === 'unavailable') throw notFound()
      const roster = fieldedRoster(screen.view, params.id)
      if (!roster) throw notFound()
      return { editable: false, snapshot: true }
    }
    const bootstrap = await rosterBootstrap({ data: { id: params.id, ...(deps.battle ? { battle: deps.battle } : {}) } })
    if (!bootstrap) throw notFound()
    const { roster, editable, faction, price, changes } = bootstrap
    const access = { roster, editable, faction }
    context.queryClient.setQueryData(rosterAccessQuery(params.id, deps.battle).queryKey, access)
    context.queryClient.setQueryData(rosterChangesQuery(params.id).queryKey, changes)
    const priced = savedRosterPriceQuery(
      roster.id,
      roster.catalogueId,
      roster.detachmentIds,
      roster.disposition,
      roster.limit,
      normalisePicks(roster.picks),
      deps.battle,
      roster.waivedRules,
      roster.borrowedDetachmentId,
      roster.optionalRules,
    )
    context.queryClient.setQueryData(priced.queryKey, price)
    return { editable, snapshot: false, preview: rosterPreview(roster, faction, price), exposure: rosterExposure(roster.visibility) }
  },
  head: ({ loaderData, match, params }) => {
    const preview = loaderData?.preview
    const exposure = loaderData?.exposure
    if (!preview || !exposure) return {}
    const path = `/rosters/${params.id}`
    return {
      meta: pageMeta(match.context.origin, {
        title: preview.title,
        description: preview.description,
        path,
        ...(exposure.image ? { image: { path: `/api/previews${path}`, alt: preview.title } } : {}),
        noindex: exposure.noindex,
      }),
    }
  },
  component: RosterRoute,
})

function RosterRoute() {
  const { id } = Route.useParams()
  const { battle, league, event, print } = Route.useSearch()
  const { editable, snapshot, league: leagueSnapshot } = Route.useLoaderData()
  return (
    <RosterPage
      id={id}
      battle={battle}
      league={league}
      event={event}
      print={print}
      editable={editable}
      snapshot={snapshot}
      leagueSnapshot={leagueSnapshot}
    />
  )
}

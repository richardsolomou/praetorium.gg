import { createFileRoute, notFound } from '@tanstack/react-router'
import { useMemo } from 'react'
import { fieldedRoster } from '../client/features/rosters/fieldedRoster'
import { RosterPage } from '../client/features/rosters/RosterPage'
import {
  battleQuery,
  leagueRosterQuery,
  rosterAccessQuery,
  rosterBootstrapQuery,
  rosterChangesQuery,
  savedRosterPriceQuery,
  outdatedLeagueEntriesQuery,
} from '../client/queries'
import { pageHead, rosterExposure, rosterPreview } from '../client/linkPreview'
import { normalisePicks } from '../client/features/rosters/rosterPicks'

export const Route = createFileRoute('/rosters/$id/')({
  // A battle token is what lets an entitled battle reader open a list that is otherwise private.
  // `add` is a datasheet a reference page asked to add, dropped once the builder has answered.
  validateSearch: (
    search: Record<string, unknown>,
  ): { battle?: string; league?: string; event?: string; print?: boolean; add?: string } => ({
    ...(typeof search.battle === 'string' ? { battle: search.battle } : {}),
    ...(typeof search.add === 'string' && search.add && search.add.length <= 64 ? { add: search.add } : {}),
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
    const bootstrapOptions = rosterBootstrapQuery(params.id, deps.battle)
    const cachedBootstrap = context.queryClient.getQueryData(bootstrapOptions.queryKey)
    const cachedUpdatedAt =
      cachedBootstrap === undefined ? undefined : context.queryClient.getQueryState(bootstrapOptions.queryKey)?.dataUpdatedAt
    const bootstrap = cachedBootstrap === undefined ? await context.queryClient.query(bootstrapOptions) : cachedBootstrap
    const seedBootstrap = (value: NonNullable<typeof bootstrap>, updatedAt: number) => {
      const current = context.queryClient.getQueryData(rosterAccessQuery(params.id, deps.battle).queryKey)
      if (current && current.roster.updatedAt > value.roster.updatedAt) return
      const seed = (key: readonly unknown[], data: unknown) => {
        if ((context.queryClient.getQueryState(key)?.dataUpdatedAt ?? 0) <= updatedAt)
          context.queryClient.setQueryData(key, data, { updatedAt })
      }
      const { roster, editable, variants, differences, faction, price, changes } = value
      seed(rosterAccessQuery(params.id, deps.battle).queryKey, { roster, editable, variants, differences, faction })
      seed(rosterChangesQuery(params.id).queryKey, changes)
      seed(
        savedRosterPriceQuery(
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
        ).queryKey,
        price,
      )
    }
    if (cachedBootstrap !== undefined)
      void context.queryClient
        .query({ ...bootstrapOptions, staleTime: 0 })
        .then((fresh) => {
          if (fresh) seedBootstrap(fresh, context.queryClient.getQueryState(bootstrapOptions.queryKey)!.dataUpdatedAt)
        })
        .catch(() => {})
    if (!bootstrap) throw notFound()
    const updatedAt = cachedUpdatedAt ?? context.queryClient.getQueryState(bootstrapOptions.queryKey)!.dataUpdatedAt
    seedBootstrap(bootstrap, updatedAt)
    const { editable, price } = bootstrap
    let { roster, faction } = bootstrap
    if (editable) await context.queryClient.query({ ...outdatedLeagueEntriesQuery(params.id), staleTime: 'static' })
    const accessKey = rosterAccessQuery(params.id, deps.battle).queryKey
    const currentAccess =
      context.queryClient.getQueryData<Pick<NonNullable<typeof bootstrap>, 'roster' | 'editable' | 'variants' | 'differences' | 'faction'>>(
        accessKey,
      )
    if (currentAccess) ({ roster, faction } = currentAccess)
    return {
      editable: currentAccess?.editable ?? editable,
      snapshot: false,
      preview: rosterPreview(roster, faction, price),
      exposure: rosterExposure(roster.visibility),
    }
  },
  head: ({ loaderData, match, params }) => {
    const preview = loaderData?.preview
    const exposure = loaderData?.exposure
    if (!preview || !exposure) return loaderData?.snapshot ? { meta: [{ name: 'robots', content: 'noindex' }] } : {}
    const path = `/rosters/${params.id}`
    return pageHead(match.context.origin, {
      title: preview.title,
      description: preview.description,
      path,
      ...(exposure.image ? { image: { path: `/api/previews${path}`, alt: preview.title } } : {}),
      noindex: exposure.noindex,
    })
  },
  component: RosterRoute,
})

function RosterRoute() {
  const { id } = Route.useParams()
  const { battle, league, event, print, add } = Route.useSearch()
  const { editable, snapshot, league: leagueSnapshot } = Route.useLoaderData()
  const navigate = Route.useNavigate()
  const requested = useMemo(
    () =>
      add
        ? { entryId: add, onSettled: () => void navigate({ search: (current) => ({ ...current, add: undefined }), replace: true }) }
        : undefined,
    [add, navigate],
  )
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
      requested={requested}
    />
  )
}

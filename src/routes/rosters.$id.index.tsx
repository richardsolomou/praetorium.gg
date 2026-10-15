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
  priceQuery,
  outdatedLeagueEntriesQuery,
} from '../client/queries'
import { pageHead, rosterExposure, rosterPreview } from '../client/linkPreview'
import { normalisePicks } from '../client/features/rosters/rosterPicks'
import { RosterLoading } from '../client/features/rosters/RosterLoading'

export const Route = createFileRoute('/rosters/$id/')({
  pendingComponent: RosterLoading,
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
      const roster = await context.queryClient.query({ ...leagueRosterQuery(deps.league, deps.event, params.id), staleTime: Infinity })
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
    // A cached refusal is asked again: access can arrive since, through a loan or a visibility change.
    const cachedBootstrap = context.queryClient.getQueryData(bootstrapOptions.queryKey) ?? undefined
    const cachedUpdatedAt =
      cachedBootstrap === undefined ? undefined : context.queryClient.getQueryState(bootstrapOptions.queryKey)?.dataUpdatedAt
    const bootstrap = cachedBootstrap ?? (await context.queryClient.query({ ...bootstrapOptions, staleTime: 0 }))
    const seedBootstrap = (value: NonNullable<typeof bootstrap>, updatedAt: number) => {
      const current = context.queryClient.getQueryData(rosterAccessQuery(params.id, deps.battle).queryKey)
      if (current && current.roster.updatedAt > value.roster.updatedAt) return
      const seed = (key: readonly unknown[], data: unknown) => {
        if ((context.queryClient.getQueryState(key)?.dataUpdatedAt ?? 0) <= updatedAt)
          context.queryClient.setQueryData(key, data, { updatedAt })
      }
      const { roster, editable, variants, differences, copiedFrom, lentBy, faction, price, changes } = value
      seed(rosterAccessQuery(params.id, deps.battle).queryKey, { roster, editable, variants, differences, copiedFrom, lentBy, faction })
      seed(rosterChangesQuery(params.id).queryKey, changes)
      // Keyed as the builder asks, so the editor opens on this answer; an owner's needs unit limits, which a price
      // worked out on this device for unsynced edits can lack.
      if (price && (!editable || price.unitLimits))
        seed(
          priceQuery(
            roster.catalogueId,
            roster.detachmentIds,
            roster.disposition,
            roster.limit,
            normalisePicks(roster.picks),
            roster.waivedRules,
            roster.borrowedDetachmentId,
            roster.optionalRules,
            editable,
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
    if (editable) void context.queryClient.query({ ...outdatedLeagueEntriesQuery(params.id), staleTime: 'static' }).catch(() => {})
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

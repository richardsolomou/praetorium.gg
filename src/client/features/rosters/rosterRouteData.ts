import type { QueryClient } from '@tanstack/react-query'
import { notFound } from '@tanstack/react-router'
import { rosterExposure, rosterPreview } from '../../linkPreview'
import {
  battleQuery,
  sealedEventRosterQuery,
  outdatedSealedEventEntriesQuery,
  setupPriceQuery,
  rosterAccessQuery,
  rosterBootstrapQuery,
  rosterChangesQuery,
} from '../../queries'
import { fieldedRoster } from './fieldedRoster'
import { normalisePicks } from './rosterPicks'
import { peekGuestDraft } from './guestDraft'
import { preparePickerUnits } from '../../functions'

export async function loadRoster(
  queryClient: QueryClient,
  id: string,
  deps: { battle?: string; sealedEvent?: string; event?: string },
  preload = false,
) {
  if (deps.sealedEvent) {
    const roster = await queryClient.query({ ...sealedEventRosterQuery(deps.sealedEvent, deps.event, id), staleTime: Infinity })
    if (!roster) throw notFound()
    return { editable: false, snapshot: true, sealedEvent: true }
  }
  if (deps.battle) {
    const screen = await queryClient.query({ ...battleQuery(deps.battle), staleTime: 'static' })
    if (!screen || screen.kind === 'unavailable') throw notFound()
    const roster = fieldedRoster(screen.view, id)
    if (!roster) throw notFound()
    return { editable: false, snapshot: true }
  }
  // A visitor's list lives in this browser under the id an account will save it with.
  if (!import.meta.env.SSR && peekGuestDraft()?.id === id) return { editable: false, snapshot: false, guestDraft: true }
  const bootstrapOptions = rosterBootstrapQuery(id)
  // A cached refusal is asked again: access can arrive since, through a loan or a visibility change.
  const cachedBootstrap = queryClient.getQueryData(bootstrapOptions.queryKey) ?? undefined
  const cachedUpdatedAt = cachedBootstrap === undefined ? undefined : queryClient.getQueryState(bootstrapOptions.queryKey)?.dataUpdatedAt
  const bootstrap = cachedBootstrap ?? (await queryClient.query({ ...bootstrapOptions, staleTime: 0 }))
  const seedBootstrap = (value: NonNullable<typeof bootstrap>, updatedAt: number) => {
    const current = queryClient.getQueryData(rosterAccessQuery(id).queryKey)
    if (current && current.roster.updatedAt > value.roster.updatedAt) return
    const seed = (key: readonly unknown[], data: unknown) => {
      if ((queryClient.getQueryState(key)?.dataUpdatedAt ?? 0) <= updatedAt) queryClient.setQueryData(key, data, { updatedAt })
    }
    const { roster, editable, variants, differences, copiedFrom, lentBy, faction, price, changes } = value
    seed(rosterAccessQuery(id).queryKey, { roster, editable, variants, differences, copiedFrom, lentBy, faction })
    seed(rosterChangesQuery(id).queryKey, changes)
    // Keyed as the builder asks, so the editor opens on this answer; an owner's needs unit limits, which a price
    // worked out on this device for unsynced edits can lack.
    if (price && (!editable || price.unitLimits)) seed(setupPriceQuery(roster, normalisePicks(roster.picks), editable).queryKey, price)
  }
  if (cachedBootstrap !== undefined)
    void queryClient
      .query({ ...bootstrapOptions, staleTime: 0 })
      .then((fresh) => {
        if (fresh) seedBootstrap(fresh, queryClient.getQueryState(bootstrapOptions.queryKey)!.dataUpdatedAt)
      })
      .catch(() => {})
  if (!bootstrap) {
    // A roster made on a device that has not synced yet exists only in that browser's storage.
    if (import.meta.env.SSR) return { editable: false, snapshot: false, onDevice: true }
    throw notFound()
  }
  const updatedAt = cachedUpdatedAt ?? queryClient.getQueryState(bootstrapOptions.queryKey)!.dataUpdatedAt
  seedBootstrap(bootstrap, updatedAt)
  const { editable, price } = bootstrap
  let { roster, faction } = bootstrap
  if (editable) void queryClient.query({ ...outdatedSealedEventEntriesQuery(id), staleTime: 'static' }).catch(() => {})
  // The editor asks for this list's picker once it renders; starting the build now hides most of a first build's
  // seconds. A hovered link preloads this route too, and starts nothing the reader may never open.
  if (editable && !preload)
    void preparePickerUnits({
      data: {
        catalogueId: roster.catalogueId,
        battleSize: roster.limit,
        waivedRules: roster.waivedRules,
        detachmentIds: roster.detachmentIds,
      },
    }).catch(() => {})
  const currentAccess = queryClient.getQueryData<
    Pick<NonNullable<typeof bootstrap>, 'roster' | 'editable' | 'variants' | 'differences' | 'faction'>
  >(rosterAccessQuery(id).queryKey)
  if (currentAccess) ({ roster, faction } = currentAccess)
  return {
    editable: currentAccess?.editable ?? editable,
    snapshot: false,
    preview: rosterPreview(roster, faction, price),
    exposure: rosterExposure(roster.visibility),
  }
}

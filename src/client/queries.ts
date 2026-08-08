import { queryOptions } from '@tanstack/react-query'
import type { RosterPick } from '../server/schemas'
import {
  battleReport,
  catalogueStatus,
  collection,
  deployments,
  datasheet,
  datasheetBySlug,
  detachmentRules,
  detachmentDetail,
  factions,
  me,
  myBattles,
  openBattle,
  priceRoster,
  savedRosters,
  savedRosterPrice,
  sharedRoster,
  signInOptions,
  units,
} from '../server/fns'

const SSR_STALE_TIME = 30_000

export const meQuery = () => queryOptions({ queryKey: ['me'], queryFn: () => me(), staleTime: SSR_STALE_TIME })

export const battlesQuery = () => queryOptions({ queryKey: ['battles'], queryFn: () => myBattles(), staleTime: SSR_STALE_TIME })

// No polling: `useLiveBattle` refetches this when the server says the battle changed.
export const battleQuery = (token: string) =>
  queryOptions({ queryKey: ['battle', token], queryFn: () => openBattle({ data: { token } }), staleTime: SSR_STALE_TIME })

export const factionsQuery = () => queryOptions({ queryKey: ['factions'], queryFn: () => factions(), staleTime: Infinity })

/** The datasheets the player owns models for, so the picker can filter on it. */
export const collectionQuery = () => queryOptions({ queryKey: ['collection'], queryFn: () => collection(), staleTime: SSR_STALE_TIME })

export const unitsQuery = (catalogueId: string, query: string, legends = false) =>
  queryOptions({
    queryKey: ['units', catalogueId, query, legends],
    queryFn: () => units({ data: { catalogueId, query, legends } }),
    enabled: Boolean(catalogueId),
    staleTime: SSR_STALE_TIME,
  })

export const datasheetQuery = (catalogueId: string, entryId: string) =>
  queryOptions({
    queryKey: ['datasheet', catalogueId, entryId],
    queryFn: () => datasheet({ data: { catalogueId, entryId } }),
    enabled: Boolean(catalogueId && entryId),
    staleTime: Infinity,
  })

export const datasheetSlugQuery = (catalogueId: string, slug: string) =>
  queryOptions({
    queryKey: ['datasheet-slug', catalogueId, slug],
    queryFn: () => datasheetBySlug({ data: { catalogueId, slug } }),
    enabled: Boolean(catalogueId && slug),
    staleTime: Infinity,
  })

/** Keyed on the picks, so the price follows the list without anything having to remember to ask. */
export const priceQuery = (catalogueId: string, detachmentIds: readonly string[], limit: number, picked: readonly RosterPick[]) =>
  queryOptions({
    queryKey: ['price', catalogueId, detachmentIds, limit, picked],
    queryFn: () => priceRoster({ data: { catalogueId, detachmentIds: [...detachmentIds], limit, units: [...picked] } }),
    enabled: Boolean(catalogueId),
    staleTime: SSR_STALE_TIME,
  })

/** Hydrates the same pricing cache entry through a refresh-safe GET keyed by saved id. */
export const savedRosterPriceQuery = (
  id: string,
  catalogueId: string,
  detachmentIds: readonly string[],
  limit: number,
  picked: readonly RosterPick[],
) =>
  queryOptions({
    ...priceQuery(catalogueId, detachmentIds, limit, picked),
    queryFn: () => savedRosterPrice({ data: { id } }),
  })

export const savedRostersQuery = () =>
  queryOptions({ queryKey: ['saved-rosters'], queryFn: () => savedRosters(), staleTime: SSR_STALE_TIME })

export const sharedRosterQuery = (id: string) =>
  queryOptions({ queryKey: ['shared-roster', id], queryFn: () => sharedRoster({ data: { id } }), staleTime: SSR_STALE_TIME })

/** Null when the rules source has not been synced, so the interface can offer typing instead. */
export const detachmentRulesQuery = (catalogueId: string, detachmentNames: readonly string[]) =>
  queryOptions({
    queryKey: ['detachment-rules', catalogueId, detachmentNames],
    queryFn: () => detachmentRules({ data: { catalogueId, detachmentNames: [...detachmentNames] } }),
    enabled: Boolean(catalogueId && detachmentNames.length),
    staleTime: Infinity,
  })

export const detachmentDetailQuery = (catalogueId: string, slug: string) =>
  queryOptions({
    queryKey: ['detachment-detail', catalogueId, slug],
    queryFn: () => detachmentDetail({ data: { catalogueId, slug } }),
    enabled: Boolean(catalogueId && slug),
    staleTime: Infinity,
  })

export const deploymentsQuery = () => queryOptions({ queryKey: ['deployments'], queryFn: () => deployments(), staleTime: Infinity })

export const reportQuery = (token: string, enabled: boolean) =>
  queryOptions({ queryKey: ['report', token], queryFn: () => battleReport({ data: { token } }), enabled })

/** Polled only while the data is on its way, so a settled instance asks once. */
export const catalogueStatusQuery = () =>
  queryOptions({
    queryKey: ['catalogue-status'],
    queryFn: () => catalogueStatus(),
    refetchInterval: (query) => (query.state.data?.status === 'working' ? 3000 : false),
  })

export const signInOptionsQuery = () => queryOptions({ queryKey: ['sign-in-options'], queryFn: () => signInOptions(), staleTime: Infinity })

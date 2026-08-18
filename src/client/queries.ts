import { queryOptions } from '@tanstack/react-query'
import type { RosterPick } from '../core/roster'
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
  factionDatasheets,
  factionIndex,
  favouriteFactions,
  friendships,
  gameReferences,
  globalSearch,
  me,
  myBattles,
  openBattle,
  opponents,
  priceRoster,
  savedRosters,
  savedRosterPrice,
  sharedRoster,
  signInOptions,
  terrainReferences,
  units,
} from '../server/functions'

const SSR_STALE_TIME = 30_000

export const meQuery = () => queryOptions({ queryKey: ['me'], queryFn: () => me(), staleTime: SSR_STALE_TIME })

export const battlesQuery = () => queryOptions({ queryKey: ['battles'], queryFn: () => myBattles(), staleTime: SSR_STALE_TIME })
export const opponentsQuery = () => queryOptions({ queryKey: ['opponents'], queryFn: () => opponents(), staleTime: SSR_STALE_TIME })
export const friendshipsQuery = () => queryOptions({ queryKey: ['friendships'], queryFn: () => friendships(), staleTime: SSR_STALE_TIME })

// No polling: `useLiveBattle` refetches this when the server says the battle changed.
export const battleQuery = (token: string) =>
  queryOptions({ queryKey: ['battle', token], queryFn: () => openBattle({ data: { token } }), staleTime: SSR_STALE_TIME })

export const factionsQuery = () => queryOptions({ queryKey: ['factions'], queryFn: () => factions(), staleTime: Infinity })
export const factionIndexQuery = () => queryOptions({ queryKey: ['faction-index'], queryFn: () => factionIndex(), staleTime: Infinity })
export const favouriteFactionsQuery = () =>
  queryOptions({ queryKey: ['favourite-factions'], queryFn: () => favouriteFactions(), staleTime: SSR_STALE_TIME })
export const gameReferencesQuery = () =>
  queryOptions({ queryKey: ['game-references'], queryFn: () => gameReferences(), staleTime: Infinity })

export const globalSearchQuery = (query: string) =>
  queryOptions({
    queryKey: ['global-search', query],
    queryFn: () => globalSearch({ data: { query } }),
    enabled: query.trim().length >= 2,
    staleTime: 30_000,
  })

export const terrainMatchupIds = (dispositions: readonly string[], solo = false) => {
  const matchup = dispositions.length === 2 ? dispositions : solo && dispositions[0] ? [dispositions[0], dispositions[0]] : []
  return matchup.length === 2 ? [...new Set([`${matchup[0]}-vs-${matchup[1]}`, `${matchup[1]}-vs-${matchup[0]}`])].toSorted() : []
}

export const terrainReferencesQuery = (matchupIds: readonly string[]) =>
  queryOptions({
    queryKey: ['terrain-references', ...matchupIds],
    queryFn: () => terrainReferences({ data: { matchupIds: [...matchupIds] } }),
    enabled: Boolean(matchupIds.length),
    staleTime: Infinity,
  })

/** The datasheets the player owns models for, so the picker can filter on it. */
export const collectionQuery = () => queryOptions({ queryKey: ['collection'], queryFn: () => collection(), staleTime: SSR_STALE_TIME })

export const unitsQuery = (catalogueId: string, query: string) =>
  queryOptions({
    queryKey: ['units', catalogueId, query],
    queryFn: () => units({ data: { catalogueId, query } }),
    enabled: Boolean(catalogueId),
    staleTime: SSR_STALE_TIME,
  })

export const factionDatasheetsQuery = (catalogueId: string, query: string) =>
  queryOptions({
    queryKey: ['faction-datasheets', catalogueId, query],
    queryFn: () => factionDatasheets({ data: { catalogueId, query } }),
    enabled: Boolean(catalogueId),
    staleTime: SSR_STALE_TIME,
  })

export const datasheetQuery = (
  catalogueId: string,
  entryId: string,
  detachmentIds: readonly string[] = [],
  picks: readonly RosterPick[] = [],
  pickIndex: number | null = null,
) =>
  queryOptions({
    queryKey: ['datasheet', catalogueId, entryId, detachmentIds, picks, pickIndex],
    queryFn: () => datasheet({ data: { catalogueId, entryId, detachmentIds: [...detachmentIds], picks: [...picks], pickIndex } }),
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
export const priceQuery = (
  catalogueId: string,
  detachmentIds: readonly string[],
  disposition: string | null,
  limit: number,
  picked: readonly RosterPick[],
) =>
  queryOptions({
    queryKey: ['price', catalogueId, detachmentIds, disposition, limit, picked],
    queryFn: () => priceRoster({ data: { catalogueId, detachmentIds: [...detachmentIds], disposition, limit, units: [...picked] } }),
    enabled: Boolean(catalogueId),
    staleTime: SSR_STALE_TIME,
  })

/** Hydrates the same pricing cache entry through a refresh-safe GET keyed by saved id. */
export const savedRosterPriceQuery = (
  id: string,
  catalogueId: string,
  detachmentIds: readonly string[],
  disposition: string | null,
  limit: number,
  picked: readonly RosterPick[],
) =>
  queryOptions({
    ...priceQuery(catalogueId, detachmentIds, disposition, limit, picked),
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

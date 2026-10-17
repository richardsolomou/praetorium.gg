import { offlineData, offlineDatasheets, referenceData } from '../offline/runtime'
import { infiniteQueryOptions, type QueryClient, queryOptions } from '@tanstack/react-query'
import type { FormatRuleId, OptionalRuleId } from '../../core/battle'
import type { RosterPick } from '../../core/roster'
import type { UnitSummary } from '../../contracts/catalogue'
import type { RosterAudience, RosterDiscoveryCursor, RosterDiscoveryFilter } from '../../core/rosterDiscovery'
import {
  collection,
  collectionCounts,
  collectionProgress,
  collectionWishes,
  collectionPhotos,
  datasheetPhotos,
  fieldedDatasheets,
  datasheet,
  datasheetOfferedBy,
  discoverRosters,
  factionDatasheets,
  homeRosters,
  loadoutDatasheets,
  priceRoster,
  rosterAccess,
  rosterBootstrap,
  rosterLoans,
  rostersLentToMe,
  savedRosterLoadoutDatasheets,
  savedRosterSummaries,
  savedRosterPage,
  sharedRoster,
  units,
} from '../functions'
import { savedRosterChangedIdsQuery } from './changes'
import { SSR_STALE_TIME } from './shared'
import { rosterPriceKey } from './rosterPriceKey'

/** Never saved for offline reading: a roster made private must leave the page on the next read. */
export const discoveredRostersQuery = (filter: RosterDiscoveryFilter, audience: RosterAudience) =>
  infiniteQueryOptions({
    queryKey: ['discovered-rosters', audience, filter],
    queryFn: ({ pageParam }) => discoverRosters({ data: { ...filter, audience, before: pageParam } }),
    initialPageParam: null as RosterDiscoveryCursor | null,
    getNextPageParam: (page) => page.nextCursor ?? undefined,
    staleTime: SSR_STALE_TIME,
  })

export const collectionQuery = () => queryOptions({ queryKey: ['collection'], queryFn: () => collection(), staleTime: SSR_STALE_TIME })
export const fieldedDatasheetsQuery = () =>
  queryOptions({ queryKey: ['fielded-datasheets'], queryFn: () => fieldedDatasheets(), staleTime: SSR_STALE_TIME })
export const collectionCountsQuery = () =>
  queryOptions({ queryKey: ['collection-counts'], queryFn: () => collectionCounts(), staleTime: SSR_STALE_TIME })
/** Only datasheets with built models appear; the rest have none built or painted. */
export const collectionProgressQuery = () =>
  queryOptions({ queryKey: ['collection-progress'], queryFn: () => collectionProgress(), staleTime: SSR_STALE_TIME })
export const collectionWishesQuery = () =>
  queryOptions({ queryKey: ['collection-wishes'], queryFn: () => collectionWishes(), staleTime: SSR_STALE_TIME })
/** Never saved for offline reading: a photo whose owner stops sharing must leave the page on the next read. */
export const datasheetPhotosQuery = (entryId: string) =>
  queryOptions({
    queryKey: ['datasheet-photos', entryId],
    queryFn: () => datasheetPhotos({ data: { entryId } }),
    staleTime: SSR_STALE_TIME,
  })
export const collectionPhotosQuery = () =>
  queryOptions({ queryKey: ['collection-photos'], queryFn: () => collectionPhotos(), staleTime: SSR_STALE_TIME })

export const unitsQuery = (
  catalogueId: string,
  battleSize?: number,
  waivedRules: readonly FormatRuleId[] = [],
  detachmentIds: readonly string[] = [],
) =>
  queryOptions({
    queryKey: ['units', catalogueId, battleSize ?? null, waivedRules, detachmentIds],
    queryFn: ({ signal }) =>
      units({
        data: {
          catalogueId,
          detachmentIds: [...detachmentIds],
          query: '',
          ...(battleSize === undefined ? {} : { battleSize }),
          waivedRules: [...waivedRules],
        },
        signal,
      }),
    enabled: Boolean(catalogueId),
    staleTime: Infinity,
  })

export const datasheetOfferedByQuery = (entryId: string, catalogueIds: readonly string[]) =>
  queryOptions({
    queryKey: ['datasheet-offered-by', entryId, catalogueIds],
    queryFn: ({ signal }) => datasheetOfferedBy({ data: { entryId, catalogueIds: [...catalogueIds] }, signal }),
    enabled: Boolean(entryId && catalogueIds.length),
    staleTime: Infinity,
  })

export const factionDatasheetsQuery = (catalogueId: string, query: string) =>
  queryOptions({
    queryKey: ['faction-datasheets', catalogueId, query],
    networkMode: 'always',
    initialData: () => offlineDatasheets(catalogueId, query) ?? undefined,
    initialDataUpdatedAt: () => referenceData()?.savedAt ?? 0,
    queryFn: async ({ client }) => {
      const saved = offlineDatasheets(catalogueId, query)
      const current = client.getQueryData<UnitSummary[]>(['faction-datasheets', catalogueId, query])
      if (typeof window !== 'undefined' && !navigator.onLine && current !== undefined) return current
      if (saved && offlineData()) return saved
      try {
        return await factionDatasheets({ data: { catalogueId, query } })
      } catch (error) {
        if (current !== undefined) return current
        if (saved) return saved
        throw error
      }
    },
    enabled: Boolean(catalogueId),
    staleTime: () => (offlineData() ? Infinity : SSR_STALE_TIME),
  })

export const datasheetQuery = (
  catalogueId: string,
  entryId: string,
  detachmentIds: readonly string[] = [],
  picks: readonly RosterPick[] = [],
  pickIndex: number | null = null,
  everyWeapon = false,
) =>
  queryOptions({
    queryKey: ['datasheet', catalogueId, entryId, detachmentIds, picks, pickIndex, everyWeapon],
    queryFn: ({ signal }) =>
      datasheet({ data: { catalogueId, entryId, detachmentIds: [...detachmentIds], picks: [...picks], pickIndex, everyWeapon }, signal }),
    enabled: Boolean(catalogueId && entryId),
    staleTime: Infinity,
  })

const datasheetLoads = new WeakMap<object, { request: number; resolvedAt: number }>()

/** How long a loadout's datasheets took to arrive and when they did, for measuring how long they then take to draw. */
export const datasheetLoad = (sheets: object) => datasheetLoads.get(sheets)

export const loadoutDatasheetsQuery = (
  catalogueId: string,
  entryId: string,
  detachmentIds: readonly string[],
  picks: readonly RosterPick[],
  pickIndex: number | null,
  persistedRoster?: { id: string; battle?: string },
) =>
  queryOptions({
    queryKey: persistedRoster
      ? ['saved-roster-loadout-datasheets', persistedRoster.id, persistedRoster.battle ?? null, pickIndex]
      : ['loadout-datasheets', catalogueId, entryId, detachmentIds, picks, pickIndex],
    queryFn: async ({ signal }) => {
      const startedAt = performance.now()
      const result =
        persistedRoster && pickIndex !== null
          ? await savedRosterLoadoutDatasheets({
              data: { id: persistedRoster.id, ...(persistedRoster.battle ? { battle: persistedRoster.battle } : {}), pickIndex },
              signal,
            })
          : await loadoutDatasheets({
              data: { catalogueId, entryId, detachmentIds: [...detachmentIds], picks: [...picks], pickIndex },
              signal,
            })
      const resolvedAt = performance.now()
      if (result) datasheetLoads.set(result, { request: resolvedAt - startedAt, resolvedAt })
      return result
    },
    enabled: Boolean((persistedRoster && pickIndex !== null) || (catalogueId && entryId)),
    staleTime: Infinity,
  })

export const priceQuery = (
  catalogueId: string,
  detachmentIds: readonly string[],
  disposition: string | null,
  limit: number,
  picked: readonly RosterPick[],
  waivedRules: readonly FormatRuleId[] = [],
  borrowedDetachmentId: string | null = null,
  optionalRules: readonly OptionalRuleId[] = [],
  includeUnitLimits = false,
) => {
  const data = {
    includeUnitLimits,
    catalogueId,
    detachmentIds: [...detachmentIds],
    disposition,
    borrowedDetachmentId,
    limit,
    units: [...picked],
    waivedRules: [...waivedRules],
    optionalRules: [...optionalRules],
  }
  return queryOptions({
    queryKey: rosterPriceKey(data),
    queryFn: ({ signal }) => priceRoster({ data, signal }),
    enabled: Boolean(catalogueId),
    staleTime: SSR_STALE_TIME,
  })
}

export const savedRosterSummariesQuery = () =>
  queryOptions({
    queryKey: ['saved-roster-summaries'],
    queryFn: ({ signal }) => savedRosterSummaries({ signal }),
    staleTime: SSR_STALE_TIME,
  })
export const savedRosterPageQuery = (ids: string[]) =>
  queryOptions({
    queryKey: ['saved-roster-page', ids],
    queryFn: ({ signal }) => savedRosterPage({ data: { ids }, signal }),
    staleTime: SSR_STALE_TIME,
  })
export const homeRostersQuery = () =>
  queryOptions({ queryKey: ['home-rosters'], queryFn: ({ signal }) => homeRosters({ signal }), staleTime: SSR_STALE_TIME })
export const rosterBootstrapQuery = (id: string, battle?: string) =>
  queryOptions({
    queryKey: ['roster-bootstrap', id, battle ?? null],
    queryFn: ({ signal }) => rosterBootstrap({ data: { id, ...(battle ? { battle } : {}) }, signal }),
    staleTime: SSR_STALE_TIME,
  })

export function invalidateSavedRosters(queryClient: QueryClient) {
  return Promise.all([
    queryClient.invalidateQueries({ queryKey: ['roster-access'] }),
    queryClient.invalidateQueries({ queryKey: ['roster-bootstrap'] }),
    queryClient.invalidateQueries({ queryKey: ['shared-roster'] }),
    queryClient.invalidateQueries({ queryKey: ['saved-roster-loadout-datasheets'] }),
    queryClient.invalidateQueries({ queryKey: ['player-rosters'] }),
    queryClient.invalidateQueries({ queryKey: ['player-profile'] }),
    queryClient.invalidateQueries({ queryKey: savedRosterSummariesQuery().queryKey }),
    queryClient.invalidateQueries({ queryKey: homeRostersQuery().queryKey }),
    queryClient.invalidateQueries({ queryKey: ['saved-roster-page'] }),
    queryClient.invalidateQueries({ queryKey: savedRosterChangedIdsQuery().queryKey }),
    queryClient.invalidateQueries({ queryKey: ['roster-changes'] }),
    queryClient.invalidateQueries({ queryKey: ['outdated-league-entries'] }),
  ])
}

export const sharedRosterQuery = (id: string, battle?: string) =>
  queryOptions({
    queryKey: ['shared-roster', id, battle ?? null],
    queryFn: () => sharedRoster({ data: { id, ...(battle ? { battle } : {}) } }),
    staleTime: SSR_STALE_TIME,
  })
/** The friends an owner has lent a roster to. */
export const rosterLoansQuery = (id: string) =>
  queryOptions({
    queryKey: ['roster-loans', id],
    queryFn: ({ signal }) => rosterLoans({ data: { id }, signal }),
    staleTime: SSR_STALE_TIME,
  })

/** Rosters friends have lent the signed-in player. */
export const rostersLentToMeQuery = () =>
  queryOptions({ queryKey: ['rosters-lent-to-me'], queryFn: ({ signal }) => rostersLentToMe({ signal }), staleTime: SSR_STALE_TIME })

export const rosterAccessQuery = (id: string, battle?: string) =>
  queryOptions({
    queryKey: ['roster-access', id, battle ?? null],
    queryFn: ({ signal }) => rosterAccess({ data: { id, ...(battle ? { battle } : {}) }, signal }),
    staleTime: SSR_STALE_TIME,
  })

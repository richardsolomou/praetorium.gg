import { currentReference, offlineDatasheets, referenceData } from '../offline/runtime'
import { infiniteQueryOptions, keepPreviousData, type QueryClient, queryOptions } from '@tanstack/react-query'
import type { FormatRuleId, OptionalRuleId } from '../../core/battle'
import type { RosterPick } from '../../core/roster'
import type { FactionDatasheet } from '../../contracts/catalogue'
import type { RosterAudience, RosterDiscoveryCursor, RosterDiscoveryFilter } from '../../core/rosterDiscovery'
import type { RosterSort } from '../../core/rosterSort'
import type { BattlesCursor } from '../../contracts/battles'
import {
  collection,
  collectionCounts,
  collectionProgress,
  collectionWishes,
  collectionCountsAs,
  collectionPhotos,
  collectionPhotoShows,
  datasheetPhotos,
  fieldedDatasheets,
  wishlistSuggestions,
  datasheet,
  datasheetOfferedBy,
  discoverRosters,
  discoverPlayedArmies,
  factionDatasheets,
  homeRosters,
  loadoutDatasheets,
  priceRoster,
  unitBattleDetails,
  rosterAccess,
  rosterBootstrap,
  rosterLoans,
  rostersLentToMe,
  savedRosterLoadoutDatasheets,
  savedRosterSummaries,
  savedRosterPage,
  sharedRoster,
  reminderAbilities,
  unitLoadouts,
  units,
} from '../functions'
import { inFamilies, savedRosterFamilies } from '../productSignals'
import { referenceStaleTime, SSR_STALE_TIME } from './shared'
import {
  collectionCountsKey,
  collectionKey,
  collectionProgressKey,
  collectionWishesKey,
  collectionCountsAsKey,
  datasheetPhotosKey,
  factionDatasheetsKey,
  fieldedDatasheetsKey,
  wishlistSuggestionsKey,
  homeRostersKey,
  rosterAccessKey,
  rosterBootstrapKey,
  savedRosterPageKey,
  savedRosterSummariesKey,
  sharedRosterKey,
  unitLoadoutsKey,
  rosterPriceKey,
} from './queryKeys'

/** The player's saved unit loadouts, which the builder offers to every roster of the same army. */
export const unitLoadoutsQuery = () =>
  queryOptions({ queryKey: unitLoadoutsKey(), queryFn: () => unitLoadouts(), staleTime: SSR_STALE_TIME })

/** Never saved for offline reading: a battle whose player narrows its audience must leave the page on the next read. */
export const playedArmiesQuery = (filter: RosterDiscoveryFilter) =>
  infiniteQueryOptions({
    queryKey: ['played-armies', filter],
    queryFn: ({ pageParam }) => discoverPlayedArmies({ data: { ...filter, before: pageParam } }),
    initialPageParam: null as BattlesCursor | null,
    getNextPageParam: (page) => page.nextCursor ?? undefined,
    staleTime: SSR_STALE_TIME,
  })

/** Never saved for offline reading: a roster made private must leave the page on the next read. */
export const discoveredRostersQuery = (filter: RosterDiscoveryFilter, audience: RosterAudience, sort: RosterSort) =>
  infiniteQueryOptions({
    queryKey: ['discovered-rosters', audience, sort, filter],
    queryFn: ({ pageParam }) => discoverRosters({ data: { ...filter, audience, sort, before: pageParam } }),
    initialPageParam: null as RosterDiscoveryCursor | null,
    getNextPageParam: (page) => page.nextCursor ?? undefined,
    staleTime: SSR_STALE_TIME,
  })

export const collectionQuery = () => queryOptions({ queryKey: collectionKey(), queryFn: () => collection(), staleTime: SSR_STALE_TIME })
export const fieldedDatasheetsQuery = () =>
  queryOptions({ queryKey: fieldedDatasheetsKey(), queryFn: () => fieldedDatasheets(), staleTime: SSR_STALE_TIME })
export const wishlistSuggestionsQuery = () =>
  queryOptions({ queryKey: wishlistSuggestionsKey(), queryFn: () => wishlistSuggestions(), staleTime: SSR_STALE_TIME })
export const collectionCountsQuery = () =>
  queryOptions({ queryKey: collectionCountsKey(), queryFn: () => collectionCounts(), staleTime: SSR_STALE_TIME })
/** Only datasheets with built models appear; the rest have none built or painted. */
export const collectionProgressQuery = () =>
  queryOptions({ queryKey: collectionProgressKey(), queryFn: () => collectionProgress(), staleTime: SSR_STALE_TIME })
export const collectionCountsAsQuery = () =>
  queryOptions({ queryKey: collectionCountsAsKey(), queryFn: () => collectionCountsAs(), staleTime: SSR_STALE_TIME })
export const collectionWishesQuery = () =>
  queryOptions({ queryKey: collectionWishesKey(), queryFn: () => collectionWishes(), staleTime: SSR_STALE_TIME })
/** Never saved for offline reading: a photo whose owner stops sharing must leave the page on the next read. */
export const datasheetPhotosQuery = (entryId: string) =>
  queryOptions({
    queryKey: datasheetPhotosKey(entryId),
    queryFn: () => datasheetPhotos({ data: { entryId } }),
    staleTime: SSR_STALE_TIME,
  })
export const collectionPhotosQuery = () =>
  queryOptions({ queryKey: ['collection-photos'], queryFn: () => collectionPhotos(), staleTime: SSR_STALE_TIME })
export const collectionPhotoShowsQuery = () =>
  queryOptions({ queryKey: ['collection-photo-shows'], queryFn: () => collectionPhotoShows(), staleTime: SSR_STALE_TIME })

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
    queryKey: factionDatasheetsKey(catalogueId, query),
    networkMode: 'always',
    initialData: () => offlineDatasheets(catalogueId, query) ?? undefined,
    initialDataUpdatedAt: () => (currentReference() ? Date.now() : (referenceData()?.savedAt ?? 0)),
    queryFn: async ({ client }) => {
      const saved = offlineDatasheets(catalogueId, query)
      const current = client.getQueryData<FactionDatasheet[]>(factionDatasheetsKey(catalogueId, query))
      if (typeof window !== 'undefined' && !navigator.onLine && current !== undefined) return current
      if (saved && currentReference()) return saved
      try {
        return await factionDatasheets({ data: { catalogueId, query } })
      } catch (error) {
        if (current !== undefined) return current
        if (saved) return saved
        throw error
      }
    },
    enabled: Boolean(catalogueId),
    staleTime: referenceStaleTime,
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

/** The abilities each unit of a list holds, so the builder can count the alerts a battle would give it. */
export const reminderAbilitiesQuery = (catalogueId: string, detachmentIds: readonly string[], picks: readonly RosterPick[]) =>
  queryOptions({
    queryKey: ['reminder-abilities', catalogueId, detachmentIds, picks],
    queryFn: ({ signal }) => reminderAbilities({ data: { catalogueId, detachmentIds: [...detachmentIds], picks: [...picks] }, signal }),
    enabled: Boolean(catalogueId && picks.length),
    placeholderData: keepPreviousData,
  })

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

/** `priceQuery` for a list's own setup. */
export const setupPriceQuery = (
  setup: {
    catalogueId: string
    detachmentIds: readonly string[]
    disposition: string | null
    limit: number
    waivedRules?: readonly FormatRuleId[]
    borrowedDetachmentId?: string | null
    optionalRules?: readonly OptionalRuleId[]
  },
  picked: readonly RosterPick[],
  includeUnitLimits = false,
) =>
  priceQuery(
    setup.catalogueId,
    setup.detachmentIds,
    setup.disposition,
    setup.limit,
    picked,
    setup.waivedRules,
    setup.borrowedDetachmentId ?? null,
    setup.optionalRules,
    includeUnitLimits,
  )

/** What a battle freezes of each datasheet in a list, for judging embarks as setup will. */
export const unitBattleDetailsQuery = (catalogueId: string, entryIds: readonly string[]) => {
  const data = { catalogueId, entryIds: [...new Set(entryIds)].toSorted() }
  return queryOptions({
    queryKey: ['unit-battle-details', data.catalogueId, data.entryIds],
    queryFn: ({ signal }) => unitBattleDetails({ data, signal }),
    enabled: Boolean(catalogueId) && data.entryIds.length > 0,
    staleTime: referenceStaleTime,
  })
}

export const savedRosterSummariesQuery = () =>
  queryOptions({
    queryKey: savedRosterSummariesKey(),
    queryFn: ({ signal }) => savedRosterSummaries({ signal }),
    staleTime: SSR_STALE_TIME,
  })
/** A roster the reader may open, or null once they no longer can. */
export const sharedRosterQuery = (id: string) =>
  queryOptions({
    queryKey: sharedRosterKey(id),
    queryFn: ({ signal }) => sharedRoster({ data: { id }, signal }),
    staleTime: SSR_STALE_TIME,
  })
export const savedRosterPageQuery = (ids: string[]) =>
  queryOptions({
    queryKey: savedRosterPageKey(ids),
    queryFn: ({ signal }) => savedRosterPage({ data: { ids }, signal }),
    staleTime: SSR_STALE_TIME,
  })
export const homeRostersQuery = () =>
  queryOptions({ queryKey: homeRostersKey(), queryFn: ({ signal }) => homeRosters({ signal }), staleTime: SSR_STALE_TIME })
export const rosterBootstrapQuery = (id: string, battle?: string) =>
  queryOptions({
    queryKey: rosterBootstrapKey(id, battle),
    queryFn: ({ signal }) => rosterBootstrap({ data: { id, ...(battle ? { battle } : {}) }, signal }),
    staleTime: SSR_STALE_TIME,
  })

export function invalidateSavedRosters(queryClient: QueryClient) {
  return queryClient.invalidateQueries({ predicate: inFamilies(savedRosterFamilies) })
}

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
    queryKey: rosterAccessKey(id, battle),
    queryFn: ({ signal }) => rosterAccess({ data: { id, ...(battle ? { battle } : {}) }, signal }),
    staleTime: SSR_STALE_TIME,
  })

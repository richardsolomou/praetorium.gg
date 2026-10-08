import { offlineDatasheets } from '../offline/runtime'
import { type QueryClient, queryOptions } from '@tanstack/react-query'
import type { FormatRuleId, OptionalRuleId } from '../../core/battle'
import type { RosterPick } from '../../core/roster'
import {
  collection,
  datasheet,
  datasheetOfferedBy,
  factionDatasheets,
  homeRosters,
  loadoutDatasheets,
  priceRoster,
  rosterAccess,
  rosterBootstrap,
  savedRosterLoadoutDatasheets,
  savedRosterPrice,
  savedRosterSummaries,
  savedRosterPage,
  sharedRoster,
  units,
} from '../../server/functions'
import { savedRosterChangedCountQuery } from './changes'
import { SSR_STALE_TIME } from './shared'

export const collectionQuery = () => queryOptions({ queryKey: ['collection'], queryFn: () => collection(), staleTime: SSR_STALE_TIME })

export const unitsQuery = (catalogueId: string, battleSize?: number, waivedRules: readonly FormatRuleId[] = []) =>
  queryOptions({
    queryKey: ['units', catalogueId, battleSize ?? null, waivedRules],
    queryFn: () =>
      units({ data: { catalogueId, query: '', ...(battleSize === undefined ? {} : { battleSize }), waivedRules: [...waivedRules] } }),
    enabled: Boolean(catalogueId),
    staleTime: Infinity,
  })

export const datasheetOfferedByQuery = (entryId: string, catalogueIds: readonly string[]) =>
  queryOptions({
    queryKey: ['datasheet-offered-by', entryId, catalogueIds],
    queryFn: () => datasheetOfferedBy({ data: { entryId, catalogueIds: [...catalogueIds] } }),
    enabled: Boolean(entryId && catalogueIds.length),
    staleTime: Infinity,
  })

export const factionDatasheetsQuery = (catalogueId: string, query: string) =>
  queryOptions({
    queryKey: ['faction-datasheets', catalogueId, query],
    networkMode: 'always',
    queryFn: () => Promise.resolve(offlineDatasheets(catalogueId, query) ?? factionDatasheets({ data: { catalogueId, query } })),
    enabled: Boolean(catalogueId),
    staleTime: Infinity,
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
    queryFn: () =>
      datasheet({ data: { catalogueId, entryId, detachmentIds: [...detachmentIds], picks: [...picks], pickIndex, everyWeapon } }),
    enabled: Boolean(catalogueId && entryId),
    staleTime: Infinity,
  })

export const loadoutDatasheetsQuery = (
  catalogueId: string,
  entryId: string,
  detachmentIds: readonly string[],
  picks: readonly RosterPick[],
  pickIndex: number | null,
  persistedRoster?: { id: string; battle?: string },
  onLoaded?: (durationMs: number) => void,
) =>
  queryOptions({
    queryKey: persistedRoster
      ? ['saved-roster-loadout-datasheets', persistedRoster.id, persistedRoster.battle ?? null, pickIndex]
      : ['loadout-datasheets', catalogueId, entryId, detachmentIds, picks, pickIndex],
    queryFn: async () => {
      const startedAt = performance.now()
      const result =
        persistedRoster && pickIndex !== null
          ? await savedRosterLoadoutDatasheets({
              data: { id: persistedRoster.id, ...(persistedRoster.battle ? { battle: persistedRoster.battle } : {}), pickIndex },
            })
          : await loadoutDatasheets({
              data: { catalogueId, entryId, detachmentIds: [...detachmentIds], picks: [...picks], pickIndex },
            })
      onLoaded?.(performance.now() - startedAt)
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
) =>
  queryOptions({
    queryKey: [
      'price',
      catalogueId,
      detachmentIds,
      disposition,
      limit,
      waivedRules,
      borrowedDetachmentId,
      optionalRules,
      ...(includeUnitLimits ? ['unit-limits'] : []),
      picked,
    ],
    queryFn: () =>
      priceRoster({
        data: {
          includeUnitLimits,
          catalogueId,
          detachmentIds: [...detachmentIds],
          disposition,
          borrowedDetachmentId,
          limit,
          units: [...picked],
          waivedRules: [...waivedRules],
          optionalRules: [...optionalRules],
        },
      }),
    enabled: Boolean(catalogueId),
    staleTime: SSR_STALE_TIME,
  })

export const savedRosterPriceQuery = (
  id: string,
  catalogueId: string,
  detachmentIds: readonly string[],
  disposition: string | null,
  limit: number,
  picked: readonly RosterPick[],
  battle?: string,
  waivedRules: readonly FormatRuleId[] = [],
  borrowedDetachmentId: string | null = null,
  optionalRules: readonly OptionalRuleId[] = [],
) =>
  queryOptions({
    ...priceQuery(catalogueId, detachmentIds, disposition, limit, picked, waivedRules, borrowedDetachmentId, optionalRules),
    queryFn: () => savedRosterPrice({ data: { id, ...(battle ? { battle } : {}) } }),
  })

export const savedRosterSummariesQuery = () =>
  queryOptions({ queryKey: ['saved-roster-summaries'], queryFn: () => savedRosterSummaries(), staleTime: SSR_STALE_TIME })
export const savedRosterPageQuery = (ids: string[]) =>
  queryOptions({ queryKey: ['saved-roster-page', ids], queryFn: () => savedRosterPage({ data: { ids } }), staleTime: SSR_STALE_TIME })
export const homeRostersQuery = () => queryOptions({ queryKey: ['home-rosters'], queryFn: () => homeRosters(), staleTime: SSR_STALE_TIME })
export const rosterBootstrapQuery = (id: string, battle?: string) =>
  queryOptions({
    queryKey: ['roster-bootstrap', id, battle ?? null],
    queryFn: () => rosterBootstrap({ data: { id, ...(battle ? { battle } : {}) } }),
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
    queryClient.invalidateQueries({ queryKey: savedRosterChangedCountQuery().queryKey }),
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
export const rosterAccessQuery = (id: string, battle?: string) =>
  queryOptions({
    queryKey: ['roster-access', id, battle ?? null],
    queryFn: () => rosterAccess({ data: { id, ...(battle ? { battle } : {}) } }),
    staleTime: SSR_STALE_TIME,
  })

import { type QueryClient, queryOptions } from '@tanstack/react-query'
import type { FormatRuleId, OptionalRuleId } from '../../core/battle'
import type { RosterPick } from '../../core/roster'
import {
  collection,
  datasheet,
  factionDatasheets,
  loadoutDatasheets,
  priceRoster,
  rosterAccess,
  savedRosterLoadoutDatasheets,
  savedRosterPrice,
  savedRosterSummaries,
  savedRosterTotals,
  sharedRoster,
  units,
} from '../../server/functions'
import { SSR_STALE_TIME } from './shared'

export const collectionQuery = () => queryOptions({ queryKey: ['collection'], queryFn: () => collection(), staleTime: SSR_STALE_TIME })

export const unitsQuery = (catalogueId: string, query: string, battleSize?: number, waivedRules: readonly FormatRuleId[] = []) =>
  queryOptions({
    queryKey: ['units', catalogueId, query, battleSize ?? null, waivedRules],
    queryFn: () =>
      units({ data: { catalogueId, query, ...(battleSize === undefined ? {} : { battleSize }), waivedRules: [...waivedRules] } }),
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
) =>
  queryOptions({
    queryKey: ['price', catalogueId, detachmentIds, disposition, limit, waivedRules, borrowedDetachmentId, optionalRules, picked],
    queryFn: () =>
      priceRoster({
        data: {
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
export const savedRosterTotalsQuery = () =>
  queryOptions({ queryKey: ['saved-roster-totals'], queryFn: () => savedRosterTotals(), staleTime: SSR_STALE_TIME })

export function invalidateSavedRosters(queryClient: QueryClient) {
  return Promise.all([
    queryClient.invalidateQueries({ queryKey: ['roster-access'] }),
    queryClient.invalidateQueries({ queryKey: savedRosterSummariesQuery().queryKey }),
    queryClient.invalidateQueries({ queryKey: savedRosterTotalsQuery().queryKey }),
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

import { queryOptions } from '@tanstack/react-query'
import {
  battleReport,
  catalogueStatus,
  collection,
  deployments,
  datasheet,
  detachmentRules,
  factions,
  me,
  myBattles,
  openBattle,
  priceRoster,
  savedRosters,
  sharedRoster,
  signInOptions,
  units,
} from '../server/fns'

export const meQuery = () => queryOptions({ queryKey: ['me'], queryFn: () => me() })

export const battlesQuery = () => queryOptions({ queryKey: ['battles'], queryFn: () => myBattles() })

// No polling: `useLiveBattle` refetches this when the server says the battle changed.
export const battleQuery = (token: string) => queryOptions({ queryKey: ['battle', token], queryFn: () => openBattle({ data: { token } }) })

export const factionsQuery = () => queryOptions({ queryKey: ['factions'], queryFn: () => factions(), staleTime: Infinity })

/** The datasheets the player owns models for, so the picker can filter on it. */
export const collectionQuery = () => queryOptions({ queryKey: ['collection'], queryFn: () => collection() })

export const unitsQuery = (catalogueId: string, query: string) =>
  queryOptions({
    queryKey: ['units', catalogueId, query],
    queryFn: () => units({ data: { catalogueId, query } }),
    enabled: Boolean(catalogueId),
  })

export const datasheetQuery = (catalogueId: string, entryId: string) =>
  queryOptions({
    queryKey: ['datasheet', catalogueId, entryId],
    queryFn: () => datasheet({ data: { catalogueId, entryId } }),
    enabled: Boolean(catalogueId && entryId),
    staleTime: Infinity,
  })

export type PickedUnit = {
  entryId: string
  models?: number
  choices?: Record<string, string>
  spreads?: Record<string, Record<string, number>>
  toggles?: Record<string, number>
}

/** Keyed on the picks, so the price follows the list without anything having to remember to ask. */
export const priceQuery = (catalogueId: string, detachmentIds: readonly string[], limit: number, picked: readonly PickedUnit[]) =>
  queryOptions({
    queryKey: ['price', catalogueId, detachmentIds, limit, picked],
    queryFn: () => priceRoster({ data: { catalogueId, detachmentIds: [...detachmentIds], limit, units: [...picked] } }),
    enabled: Boolean(catalogueId),
  })

export const savedRostersQuery = () => queryOptions({ queryKey: ['saved-rosters'], queryFn: () => savedRosters() })

export const sharedRosterQuery = (id: string) =>
  queryOptions({ queryKey: ['shared-roster', id], queryFn: () => sharedRoster({ data: { id } }) })

/** Null when the rules source has not been synced, so the interface can offer typing instead. */
export const detachmentRulesQuery = (catalogueId: string, detachmentNames: readonly string[]) =>
  queryOptions({
    queryKey: ['detachment-rules', catalogueId, detachmentNames],
    queryFn: () => detachmentRules({ data: { catalogueId, detachmentNames: [...detachmentNames] } }),
    enabled: Boolean(catalogueId && detachmentNames.length),
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

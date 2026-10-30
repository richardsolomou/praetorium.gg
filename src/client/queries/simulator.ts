import { queryOptions } from '@tanstack/react-query'
import type { RosterPick } from '../../core/roster'
import { combatantDatasheet, combatLoadouts, combatUnits, recentMatchups } from '../functions'
import { SSR_STALE_TIME } from './shared'
import { combatUnitsKey, recentMatchupsKey } from './queryKeys'

export const combatUnitsQuery = () => queryOptions({ queryKey: combatUnitsKey(), queryFn: () => combatUnits(), staleTime: Infinity })

export const recentMatchupsQuery = () =>
  queryOptions({ queryKey: recentMatchupsKey(), queryFn: () => recentMatchups(), staleTime: SSR_STALE_TIME })

export const combatantDatasheetQuery = (
  catalogueId: string,
  entryId: string,
  detachmentIds: readonly string[],
  picks: readonly RosterPick[],
  pickIndex: number,
  inactivePicks: readonly number[] = [],
) =>
  queryOptions({
    queryKey: ['combatant-datasheet', catalogueId, entryId, detachmentIds, picks, pickIndex, inactivePicks],
    queryFn: ({ signal }) =>
      combatantDatasheet({
        signal,
        data: { catalogueId, entryId, detachmentIds: [...detachmentIds], picks: [...picks], pickIndex, inactivePicks: [...inactivePicks] },
      }),
    enabled: Boolean(catalogueId && entryId),
    staleTime: Infinity,
  })

export const combatLoadoutsQuery = ({
  catalogueId,
  detachmentIds,
  picks,
  pickIndex,
}: {
  catalogueId: string
  detachmentIds: readonly string[]
  picks: readonly RosterPick[]
  pickIndex: number
}) =>
  queryOptions({
    queryKey: ['combat-loadouts', catalogueId, detachmentIds, picks, pickIndex],
    queryFn: ({ signal }) =>
      combatLoadouts({ data: { catalogueId, detachmentIds: [...detachmentIds], picks: [...picks], pickIndex }, signal }),
    enabled: Boolean(catalogueId && picks[pickIndex]),
    staleTime: Infinity,
  })

import { queryOptions } from '@tanstack/react-query'
import type { RosterPick } from '../../core/roster'
import { combatantDatasheet, combatUnits } from '../../server/functions'

export const combatUnitsQuery = () => queryOptions({ queryKey: ['combat-units'], queryFn: () => combatUnits(), staleTime: Infinity })

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
    queryFn: () =>
      combatantDatasheet({
        data: { catalogueId, entryId, detachmentIds: [...detachmentIds], picks: [...picks], pickIndex, inactivePicks: [...inactivePicks] },
      }),
    enabled: Boolean(catalogueId && entryId),
    staleTime: Infinity,
  })

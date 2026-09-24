import { queryOptions } from '@tanstack/react-query'
import { catalogueChangeLog, catalogueUpdate, rosterChanges, savedRosterStatus } from '../../server/functions'
import { SSR_STALE_TIME } from './shared'

/** One page of data updates, from the newest or from before a cursor the previous page gave. */
export const catalogueChangeLogQuery = (before?: string) =>
  queryOptions({
    queryKey: ['catalogue-changes', before ?? null],
    queryFn: () => catalogueChangeLog({ data: before ? { before } : {} }),
    staleTime: SSR_STALE_TIME,
  })

/** One data update, whole. */
export const catalogueUpdateQuery = (id: string) =>
  queryOptions({ queryKey: ['catalogue-update', id], queryFn: () => catalogueUpdate({ data: { id } }), staleTime: SSR_STALE_TIME })

/** The data updates since a saved list was last saved that reached something in it. */
export const rosterChangesQuery = (id: string) =>
  queryOptions({ queryKey: ['roster-changes', id], queryFn: () => rosterChanges({ data: { id } }), staleTime: SSR_STALE_TIME })

export const savedRosterStatusQuery = () =>
  queryOptions({ queryKey: ['saved-roster-status'], queryFn: () => savedRosterStatus(), staleTime: SSR_STALE_TIME })

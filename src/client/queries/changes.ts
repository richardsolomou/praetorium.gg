import { queryOptions } from '@tanstack/react-query'
import { catalogueChangeLog, rosterChanges, savedRosterStatus } from '../../server/functions'
import { SSR_STALE_TIME } from './shared'

/** One page of data updates, from the newest or from before a cursor the previous page gave. */
export const catalogueChangeLogQuery = (before?: string) =>
  queryOptions({
    queryKey: ['catalogue-changes', before ?? null],
    queryFn: () => catalogueChangeLog({ data: before ? { before } : {} }),
    staleTime: SSR_STALE_TIME,
  })

/** The data updates since a saved list was last saved that reached something in it. */
export const rosterChangesQuery = (id: string) =>
  queryOptions({ queryKey: ['roster-changes', id], queryFn: () => rosterChanges({ data: { id } }), staleTime: SSR_STALE_TIME })

export const savedRosterStatusQuery = () =>
  queryOptions({ queryKey: ['saved-roster-status'], queryFn: () => savedRosterStatus(), staleTime: SSR_STALE_TIME })

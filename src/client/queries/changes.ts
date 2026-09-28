import { queryOptions } from '@tanstack/react-query'
import { catalogueChangeLog, rosterChanges, savedRosterChangedCount } from '../../server/functions'
import { SSR_STALE_TIME } from './shared'

/**
 * One page of data updates, every faction's or the one a slug names, from the newest or from
 * before a cursor the previous page gave.
 */
export const catalogueChangeLogQuery = (before?: string, faction?: string) =>
  queryOptions({
    queryKey: ['catalogue-changes', faction ?? null, before ?? null],
    queryFn: () => catalogueChangeLog({ data: { ...(before ? { before } : {}), ...(faction ? { faction } : {}) } }),
    staleTime: SSR_STALE_TIME,
  })

/** The cursor a data updates address carries, or none for anything that cannot be one. */
export const historySearch = (search: Record<string, unknown>): { before?: string } =>
  typeof search.before === 'string' && /^[\w-]{1,4096}$/.test(search.before) ? { before: search.before } : {}

/** The data updates since a saved list was last saved that reached something in it. */
export const rosterChangesQuery = (id: string) =>
  queryOptions({ queryKey: ['roster-changes', id], queryFn: () => rosterChanges({ data: { id } }), staleTime: SSR_STALE_TIME })

export const savedRosterChangedCountQuery = () =>
  queryOptions({ queryKey: ['saved-roster-changed-count'], queryFn: () => savedRosterChangedCount(), staleTime: SSR_STALE_TIME })

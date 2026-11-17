import { queryOptions } from '@tanstack/react-query'
import { currentReference, loadSavedQuery, referenceData, savedQuery } from '../offline/runtime'
import { catalogueChangeLog, referenceChanges, rosterChanges, savedRosterChangedIds, savedRosterPlays } from '../functions'
import type { ReferenceLink } from '../../contracts/catalogueChanges'
import { referenceStaleTime, SSR_STALE_TIME } from './shared'
import { withTimeout } from '../abortSignals'
import { catalogueChangesKey, rosterChangesKey, savedRosterChangedIdsKey, savedRosterPlaysKey } from './queryKeys'

/**
 * One page of data updates, every faction's or the one a slug names, from the newest or from
 * before a cursor the previous page gave.
 */
export const catalogueChangeLogQuery = (before?: string, faction?: string) =>
  queryOptions({
    queryKey: catalogueChangesKey(faction, before),
    queryFn: () => catalogueChangeLog({ data: { ...(before ? { before } : {}), ...(faction ? { faction } : {}) } }),
    staleTime: SSR_STALE_TIME,
  })

/** The newest recorded changes to one datasheet or detachment page. */
export const referenceChangesQuery = (link: ReferenceLink) => {
  const key = ['reference-changes', link.kind, link.faction, link.slug]
  type Changes = Awaited<ReturnType<typeof referenceChanges>>
  return queryOptions({
    queryKey: key,
    networkMode: 'always',
    initialData: () => savedQuery<Changes>(currentReference(), key),
    queryFn: async ({ signal }) => {
      const saved = await loadSavedQuery<Changes>(referenceData(), key)
      if (saved && currentReference()) return saved
      if (referenceData() && !navigator.onLine) return saved ?? []
      try {
        return await referenceChanges({ data: link, signal: withTimeout(signal, 5000) })
      } catch (error) {
        if (referenceData()) return saved ?? []
        throw error
      }
    },
    staleTime: referenceStaleTime,
  })
}

/** The cursor a data updates address carries, or none for anything that cannot be one. */
export const historySearch = (search: Record<string, unknown>): { before?: string } =>
  typeof search.before === 'string' && /^[\w-]{1,4096}$/.test(search.before) ? { before: search.before } : {}

/** The data updates since a saved list was last saved that reached something in it. */
export const rosterChangesQuery = (id: string) =>
  queryOptions({ queryKey: rosterChangesKey(id), queryFn: () => rosterChanges({ data: { id } }), staleTime: SSR_STALE_TIME })

export const savedRosterChangedIdsQuery = () =>
  queryOptions({ queryKey: savedRosterChangedIdsKey(), queryFn: () => savedRosterChangedIds(), staleTime: SSR_STALE_TIME })

/** How often each saved list has been played to the end, and how those battles went. */
export const savedRosterPlaysQuery = () =>
  queryOptions({ queryKey: savedRosterPlaysKey(), queryFn: () => savedRosterPlays(), staleTime: SSR_STALE_TIME })

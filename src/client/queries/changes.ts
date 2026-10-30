import { queryOptions } from '@tanstack/react-query'
import { currentReference, referenceData, savedQuery } from '../offline/runtime'
import { armyUpdates, catalogueChangeLog, referenceChanges, rosterChanges, savedRosterChangedIds } from '../functions'
import type { ReferenceLink } from '../../contracts/catalogueChanges'
import { referenceStaleTime, SSR_STALE_TIME } from './shared'
import { withTimeout } from '../abortSignals'
import { armyUpdatesKey, catalogueChangesKey, rosterChangesKey, savedRosterChangedIdsKey } from './queryKeys'

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

/** The newest data update that reached each of these factions, by slug. */
export const armyUpdatesQuery = (factions: readonly string[]) =>
  queryOptions({
    queryKey: armyUpdatesKey(factions),
    queryFn: () => armyUpdates({ data: { factions: [...factions] } }),
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
      const saved = savedQuery<Changes>(referenceData(), key)
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

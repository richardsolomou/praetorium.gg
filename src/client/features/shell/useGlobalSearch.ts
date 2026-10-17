import { keepPreviousData, useInfiniteQuery, useQuery } from '@tanstack/react-query'
import { useMemo, useSyncExternalStore } from 'react'
import { currentReference, searchDownload, subscribePublishedReferenceRevision } from '../../offline/runtime'
import { battlesQuery, factionIndexQuery, globalSearchQuery, meQuery, savedRosterSummariesQuery } from '../../queries'
import { useSettled } from '../../useSettled'
import { SEARCH_DEBOUNCE_MS } from './globalSearchPages'

const downloadIsCurrent = () => Boolean(currentReference())

/**
 * Global search results for what the player typed. A download the service still publishes answers on
 * every keystroke, with the player's own rosters and battles from their loaded lists; anything else asks
 * the service once typing settles.
 */
export function useGlobalSearch(trimmed: string, open = true) {
  const downloaded = useSyncExternalStore(subscribePublishedReferenceRevision, downloadIsCurrent, () => false)
  const { data: me } = useQuery(meQuery())
  const own = open && downloaded && Boolean(me)
  const { data: rosters } = useQuery({ ...savedRosterSummariesQuery(), enabled: own })
  const { data: battles } = useInfiniteQuery({ ...battlesQuery(), enabled: own })
  const { data: factionIndex } = useQuery({ ...factionIndexQuery(), enabled: own })
  const local = downloaded && me !== undefined && (!me || (rosters !== undefined && battles !== undefined))
  const settled = useSettled(trimmed, SEARCH_DEBOUNCE_MS)
  const localResults = useMemo(
    () => (local && trimmed.length >= 2 ? searchDownload(trimmed, factionIndex ?? undefined, { owner: me, rosters, battles }) : null),
    [local, trimmed, factionIndex, me, rosters, battles],
  )
  const remote = useQuery({ ...globalSearchQuery(local ? '' : settled), placeholderData: keepPreviousData })
  if (local)
    return { query: trimmed, data: localResults ?? [], isPending: false, isFetching: false, isError: false, refetch: remote.refetch }
  return {
    query: settled,
    data: remote.data ?? [],
    isPending: remote.isPending,
    isFetching: remote.isFetching,
    isError: remote.isError,
    refetch: remote.refetch,
  }
}

import { keepPreviousData, useInfiniteQuery, useQuery } from '@tanstack/react-query'
import { useEffect, useMemo, useSyncExternalStore } from 'react'
import { OWN_SEARCH_BATTLES, SEARCH_MIN_LENGTH } from '../../../core/referenceSearch'
import { currentReference, decodedSearch, loadSearch, searchDownload, subscribeReference } from '../../offline/runtime'
import { battlesQuery, factionIndexQuery, globalSearchQuery, meQuery, savedRosterSummariesQuery } from '../../queries'
import { useSettled } from '../../useSettled'

const downloadIsCurrent = () => Boolean(currentReference())
const searchIsDecoded = () => Boolean(currentReference() && decodedSearch())
const subscribeOnline = (changed: () => void) => {
  window.addEventListener('online', changed)
  window.addEventListener('offline', changed)
  return () => {
    window.removeEventListener('online', changed)
    window.removeEventListener('offline', changed)
  }
}

/**
 * Global search results for what the player typed. A download the service still publishes answers on
 * every keystroke, with the player's own rosters and battles from their loaded lists; anything else asks
 * the service once typing settles. Online, the service's answer replaces the download's once typing
 * settles, because only the service searches what abilities and cards say.
 */
export function useGlobalSearch(trimmed: string, open = true) {
  const current = useSyncExternalStore(subscribeReference, downloadIsCurrent, () => false)
  const online = useSyncExternalStore(
    subscribeOnline,
    () => navigator.onLine,
    () => true,
  )
  const downloaded = useSyncExternalStore(subscribeReference, searchIsDecoded, () => false)
  // The search index is decoded only once a player searches: it covers every faction.
  useEffect(() => {
    if (open && current && !downloaded) void loadSearch().catch(() => {})
  }, [open, current, downloaded])
  const { data: me } = useQuery(meQuery())
  const own = open && current && Boolean(me)
  const { data: rosters } = useQuery({ ...savedRosterSummariesQuery(), enabled: own })
  const battlePages = useInfiniteQuery({ ...battlesQuery(), enabled: own })
  const battles = battlePages.data
  const loadedBattles = battles?.pages.reduce((count, page) => count + (page?.battles.length ?? 0), 0) ?? 0
  // The service searches the most recent battles, so the device loads as many before answering.
  const moreBattles = loadedBattles < OWN_SEARCH_BATTLES && battlePages.hasNextPage
  const { fetchNextPage, isFetchingNextPage } = battlePages
  useEffect(() => {
    if (own && moreBattles && !isFetchingNextPage) void fetchNextPage()
  }, [own, moreBattles, isFetchingNextPage, fetchNextPage])
  const { data: factionIndex } = useQuery({ ...factionIndexQuery(), enabled: own })
  const local = downloaded && me !== undefined && (!me || (rosters !== undefined && battles !== undefined && !moreBattles))
  const settled = useSettled(trimmed, 250)
  const localResults = useMemo(
    () =>
      local && trimmed.length >= SEARCH_MIN_LENGTH
        ? searchDownload(trimmed, factionIndex ?? undefined, { owner: me, rosters, battles })
        : null,
    [local, trimmed, factionIndex, me, rosters, battles],
  )
  const remote = useQuery({ ...globalSearchQuery(local && !online ? '' : settled), placeholderData: keepPreviousData })
  // Results the player has stopped typing for, which are the ones worth reporting.
  const typingSettled = settled === trimmed
  const answered = online && typingSettled && remote.data !== undefined && !remote.isPlaceholderData
  if (local)
    return {
      query: trimmed,
      typingSettled,
      data: answered ? remote.data : (localResults ?? []),
      isPending: false,
      isFetching: false,
      isError: false,
      refetch: remote.refetch,
    }
  return {
    query: settled,
    typingSettled,
    data: remote.data ?? [],
    isPending: remote.isPending,
    isFetching: remote.isFetching,
    isError: remote.isError,
    refetch: remote.refetch,
  }
}

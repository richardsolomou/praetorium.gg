import { useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { APP_SNAPSHOT_QUERIES } from '../../contracts/appSnapshot'
import { captureAppSnapshot, restoreAppSnapshot, reconcileAppAccount } from './appSnapshot'
import { APP_ACCOUNT_EVENT, clearSavedApp, readAppSnapshot, writeAppSnapshot } from './appStorage'
import {
  battlesQuery,
  battleQuery,
  battlesFrom,
  friendBattlesQuery,
  friendshipsQuery,
  homeRostersQuery,
  leaguesQuery,
  meQuery,
  onboardingQuery,
  publicBattlesQuery,
  savedRosterPageQuery,
  savedRosterSummariesQuery,
  rosterBootstrapQuery,
  outdatedLeagueEntriesQuery,
  standingsQuery,
  favouriteFactionsQuery,
  favouriteDetachmentsQuery,
} from '../queries'
import { sortRosters } from '../features/rosters/rosterSort'
import { ROSTER_LIBRARY_BATCH_SIZE } from '../../core/rosterLibrary'

export function AppPersistence() {
  const client = useQueryClient()
  useEffect(() => {
    if (window.PraetoriumAppSnapshot) {
      const current = client.getQueryData<{ id: string } | null>(['me'])
      if (current !== undefined && (current?.id ?? null) !== window.PraetoriumAppSnapshot.owner) void clearSavedApp().catch(() => {})
      else restoreAppSnapshot(client, window.PraetoriumAppSnapshot)
    }
    let active = true
    let timer: ReturnType<typeof setTimeout> | undefined
    let saving = Promise.resolve()
    let refreshing = false
    let pendingRefresh = false
    const save = () => {
      clearTimeout(timer)
      saving = saving
        .catch(() => {})
        .then(() => (active ? writeAppSnapshot(captureAppSnapshot(client)) : undefined))
        .catch(() => {})
    }
    const unsubscribe = client.getQueryCache().subscribe((event) => {
      if (
        !APP_SNAPSHOT_QUERIES.has(String(event.query.queryKey[0])) ||
        event.type === 'observerResultsUpdated' ||
        event.type === 'observerAdded' ||
        event.type === 'observerRemoved' ||
        event.type === 'observerOptionsUpdated'
      )
        return
      clearTimeout(timer)
      timer = setTimeout(save, 250)
    })
    const refresh = async () => {
      if (!active || !navigator.onLine) return
      if (refreshing) {
        pendingRefresh = true
        return
      }
      refreshing = true
      try {
        const me = await client.query({ ...meQuery(), staleTime: 0 })
        if (!active) return
        await client.invalidateQueries({
          predicate: (query) => APP_SNAPSHOT_QUERIES.has(String(query.queryKey[0])) && query.queryKey[0] !== 'me',
        })
        await Promise.allSettled([
          client.infiniteQuery({ ...publicBattlesQuery(), staleTime: 0 }),
          ...(me
            ? [
                client.infiniteQuery({ ...battlesQuery(), staleTime: 0 }).then(async (feed) => {
                  const recent = battlesFrom(feed).slice(0, ROSTER_LIBRARY_BATCH_SIZE)
                  for (let index = 0; index < recent.length; index += 3) {
                    if (!active || client.getQueryData<{ id: string }>(['me'])?.id !== me.id) break
                    await Promise.allSettled(
                      recent.slice(index, index + 3).map((battle) => client.query({ ...battleQuery(battle.token), staleTime: 0 })),
                    )
                  }
                }),
                client.infiniteQuery({ ...friendBattlesQuery(), staleTime: 0 }),
                client.query({ ...homeRostersQuery(), staleTime: 0 }),
                client.query({ ...leaguesQuery(), staleTime: 0 }),
                client.query({ ...friendshipsQuery(), staleTime: 0 }),
                client.query({ ...onboardingQuery(), staleTime: 0 }),
                client.query({ ...favouriteFactionsQuery(), staleTime: 0 }),
                client.query({ ...favouriteDetachmentsQuery(), staleTime: 0 }),
                client.query({ ...savedRosterSummariesQuery(), staleTime: 0 }).then(async (summaries) => {
                  const ids = sortRosters(summaries, 'updated-desc')
                    .slice(0, ROSTER_LIBRARY_BATCH_SIZE)
                    .map((roster) => roster.id)
                  await client.query({ ...savedRosterPageQuery(ids), staleTime: 0 })
                  for (let index = 0; index < ids.length; index += 3) {
                    if (!active || client.getQueryData<{ id: string }>(['me'])?.id !== me.id) break
                    await Promise.allSettled(
                      ids.slice(index, index + 3).map(async (id) => {
                        await client.query({ ...rosterBootstrapQuery(id), staleTime: 0 })
                        await client.query({ ...outdatedLeagueEntriesQuery(id), staleTime: 0 })
                      }),
                    )
                  }
                }),
              ]
            : [client.query({ ...standingsQuery(), staleTime: 0 })]),
        ])
      } catch {
        // Saved data remains available when the service cannot be reached.
      } finally {
        refreshing = false
        if (active) save()
        if (pendingRefresh) {
          pendingRefresh = false
          void refresh()
        }
      }
    }
    const foreground = () => {
      if (document.visibilityState === 'visible') {
        void refresh()
        save()
      } else save()
    }
    const reconnect = () => void refresh()
    const accountChanged = (event: StorageEvent) => {
      if (event.key !== APP_ACCOUNT_EVENT) return
      void client.cancelQueries().then(async () => {
        reconcileAppAccount(client, null)
        client.setQueryData(['me'], null)
        window.PraetoriumAppSnapshot = undefined
        await readAppSnapshot().catch(() => null)
        void refresh()
      })
    }
    void refresh()
    save()
    const interval = setInterval(() => {
      if (document.visibilityState === 'visible') void refresh()
    }, 60_000)
    window.addEventListener('online', reconnect)
    window.addEventListener('pagehide', save)
    window.addEventListener('storage', accountChanged)
    document.addEventListener('visibilitychange', foreground)
    return () => {
      save()
      active = false
      clearTimeout(timer)
      clearInterval(interval)
      unsubscribe()
      window.removeEventListener('online', reconnect)
      window.removeEventListener('pagehide', save)
      window.removeEventListener('storage', accountChanged)
      document.removeEventListener('visibilitychange', foreground)
    }
  }, [client])
  return null
}

import { useRouter } from '@tanstack/react-router'
import { afterInitialScreen } from './background'
import { useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { APP_SNAPSHOT_QUERIES } from '../../contracts/appSnapshot'
import { captureAppSnapshot, restoreAppSnapshot } from './appSnapshot'
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
import { refreshBattleFeed } from './refreshBattleFeed'
import { sortRosters } from '../features/rosters/rosterSort'
import { ROSTER_LIBRARY_BATCH_SIZE } from '../../core/rosterLibrary'

export function AppPersistence() {
  const client = useQueryClient()
  const router = useRouter()
  useEffect(() => {
    let active = true
    let ready = false
    let timer: ReturnType<typeof setTimeout> | undefined
    let saving = Promise.resolve()
    let refreshing = false
    let pendingRefresh = false
    let accountChangePending = false
    const save = () => {
      if (!ready || accountChangePending) return
      clearTimeout(timer)
      saving = saving
        .catch(() => {})
        .then(() => (active && !accountChangePending ? writeAppSnapshot(captureAppSnapshot(client)) : undefined))
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
      if (!active || !ready || !navigator.onLine) return
      if (refreshing) {
        pendingRefresh = true
        return
      }
      refreshing = true
      try {
        const me = await client.query({ ...meQuery(), staleTime: 0 })
        if (!active) return
        if (!pendingRefresh) accountChangePending = false
        await client.invalidateQueries({
          predicate: (query) => APP_SNAPSHOT_QUERIES.has(String(query.queryKey[0])) && query.queryKey[0] !== 'me',
        })
        if (!active || (client.getQueryData<{ id: string } | null>(['me'])?.id ?? null) !== (me?.id ?? null)) return
        await Promise.allSettled([
          refreshBattleFeed(client, publicBattlesQuery()),
          ...(me
            ? [
                refreshBattleFeed(client, battlesQuery()).then(async (feed) => {
                  const recent = battlesFrom(feed).slice(0, ROSTER_LIBRARY_BATCH_SIZE)
                  for (let index = 0; index < recent.length; index += 3) {
                    if (!active || client.getQueryData<{ id: string }>(['me'])?.id !== me.id) break
                    await Promise.allSettled(
                      recent.slice(index, index + 3).map((battle) => client.query({ ...battleQuery(battle.token), staleTime: Infinity })),
                    )
                  }
                }),
                refreshBattleFeed(client, friendBattlesQuery()),
                client.query({ ...homeRostersQuery(), staleTime: Infinity }),
                client.query({ ...leaguesQuery(), staleTime: Infinity }),
                client.query({ ...friendshipsQuery(), staleTime: Infinity }),
                client.query({ ...onboardingQuery(), staleTime: Infinity }),
                client.query({ ...favouriteFactionsQuery(), staleTime: Infinity }),
                client.query({ ...favouriteDetachmentsQuery(), staleTime: Infinity }),
                client.query({ ...savedRosterSummariesQuery(), staleTime: Infinity }).then(async (summaries) => {
                  if (!active || client.getQueryData<{ id: string }>(['me'])?.id !== me.id) return
                  const ids = sortRosters(summaries, 'updated-desc')
                    .slice(0, ROSTER_LIBRARY_BATCH_SIZE)
                    .map((roster) => roster.id)
                  await client.query({ ...savedRosterPageQuery(ids), staleTime: Infinity })
                  for (let index = 0; index < ids.length; index += 3) {
                    if (!active || client.getQueryData<{ id: string }>(['me'])?.id !== me.id) break
                    await Promise.allSettled(
                      ids.slice(index, index + 3).map(async (id) => {
                        await client.query({ ...rosterBootstrapQuery(id), staleTime: Infinity })
                        if (active && client.getQueryData<{ id: string }>(['me'])?.id === me.id)
                          await client.query({ ...outdatedLeagueEntriesQuery(id), staleTime: Infinity })
                      }),
                    )
                  }
                }),
              ]
            : [client.query({ ...standingsQuery(), staleTime: Infinity })]),
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
      accountChangePending = true
      window.PraetoriumAppSnapshot = undefined
      void readAppSnapshot()
        .catch(() => null)
        .then(() => refresh())
    }
    const cancelInitial = afterInitialScreen(router, () => {
      if (window.PraetoriumAppSnapshot) {
        const current = client.getQueryData<{ id: string } | null>(['me'])
        if (current !== undefined && (current?.id ?? null) !== window.PraetoriumAppSnapshot.owner) void clearSavedApp().catch(() => {})
        else restoreAppSnapshot(client, window.PraetoriumAppSnapshot)
      }
      ready = true
      save()
      void refresh()
    })
    const interval = setInterval(() => {
      if (document.visibilityState === 'visible') void refresh()
    }, 60_000)
    window.addEventListener('online', reconnect)
    window.addEventListener('pagehide', save)
    window.addEventListener('storage', accountChanged)
    document.addEventListener('visibilitychange', foreground)
    return () => {
      cancelInitial()
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
  }, [client, router])
  return null
}

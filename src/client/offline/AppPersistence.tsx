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
  sealedEventsQuery,
  meQuery,
  onboardingQuery,
  publicBattlesQuery,
  savedRosterSummariesQuery,
  standingsQuery,
  favouriteFactionsQuery,
  favouriteDetachmentsQuery,
  favouriteDatasheetsQuery,
  recentMatchupsQuery,
  abilityRemindersQuery,
  collectionQuery,
  collectionCountsQuery,
  collectionProgressQuery,
  collectionWishesQuery,
  collectionCountsAsQuery,
  playerDefaultsQuery,
  opponentsQuery,
  sealedEventQuery,
  sealedEventRosterQuery,
} from '../queries'
import { refreshBattleFeed } from './refreshBattleFeed'
import { prepareRosters } from './prepareRosters'
import { ROSTER_LIBRARY_BATCH_SIZE } from '../../core/rosterLibrary'
import { meKey } from '../queries/queryKeys'
import { chunks } from '../../core/collections'

/**
 * Whether a refresh of saved screens asks for this query again. A roster price depends only on its key, which holds
 * every input, so asking again repeats the costliest read for the same answer.
 */
export function refreshesSavedQuery(queryKey: readonly unknown[]) {
  const family = String(queryKey[0])
  return APP_SNAPSHOT_QUERIES.has(family) && family !== 'me' && family !== 'price'
}

/** Switching back to the app within this long of the last refresh skips it; the screen in view refreshes itself. */
const FOREGROUND_REFRESH_MS = 10 * 60_000

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
    let refreshedAt = -Infinity
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
    // Runs on reconnect, foreground and account change, never on a timer: each run refetches the whole snapshot, and screens in view already poll or subscribe.
    const refresh = async () => {
      if (!active || !ready || !navigator.onLine) return
      if (refreshing) {
        pendingRefresh = true
        return
      }
      refreshing = true
      refreshedAt = Date.now()
      try {
        const me = await client.query({ ...meQuery(), staleTime: 0 })
        if (!active) return
        if (!pendingRefresh) accountChangePending = false
        await client.invalidateQueries({
          predicate: ({ queryKey }) => refreshesSavedQuery(queryKey),
        })
        if (!active || (client.getQueryData<{ id: string } | null>(meKey())?.id ?? null) !== (me?.id ?? null)) return
        const stillSignedInAs = (id: string) => active && client.getQueryData<{ id: string }>(meKey())?.id === id
        await Promise.allSettled([
          refreshBattleFeed(client, publicBattlesQuery()),
          ...(me
            ? [
                refreshBattleFeed(client, battlesQuery()).then(async (feed) => {
                  const recent = battlesFrom(feed).slice(0, ROSTER_LIBRARY_BATCH_SIZE)
                  for (const batch of chunks(recent, 3)) {
                    if (!stillSignedInAs(me.id)) break
                    await Promise.allSettled(batch.map((battle) => client.query({ ...battleQuery(battle.token), staleTime: Infinity })))
                  }
                }),
                refreshBattleFeed(client, friendBattlesQuery()),
                client.query({ ...homeRostersQuery(), staleTime: Infinity }),
                client.query({ ...sealedEventsQuery(), staleTime: Infinity }).then(async (sealedEvents) => {
                  for (const sealedEvent of sealedEvents.filter((summary) => summary.personal)) {
                    if (!stillSignedInAs(me.id)) break
                    const saved = await client.query({ ...sealedEventQuery(sealedEvent.token), staleTime: Infinity })
                    if (!saved) continue
                    const entries = saved.entries.filter((entry) => entry.submitted && (saved.revealedAt || entry.userId === me.id))
                    for (const batch of chunks(entries, 3)) {
                      if (!stillSignedInAs(me.id)) break
                      await Promise.allSettled(
                        batch.map((entry) =>
                          client.query({
                            ...sealedEventRosterQuery(sealedEvent.token, saved.eventToken, entry.userId),
                            staleTime: Infinity,
                          }),
                        ),
                      )
                    }
                  }
                }),
                client.query({ ...collectionQuery(), staleTime: Infinity }),
                client.query({ ...collectionCountsQuery(), staleTime: Infinity }),
                client.query({ ...collectionProgressQuery(), staleTime: Infinity }),
                client.query({ ...collectionWishesQuery(), staleTime: Infinity }),
                client.query({ ...collectionCountsAsQuery(), staleTime: Infinity }),
                client.query({ ...playerDefaultsQuery(), staleTime: Infinity }),
                client.query({ ...opponentsQuery(), staleTime: Infinity }),
                client.query({ ...friendshipsQuery(), staleTime: Infinity }),
                client.query({ ...onboardingQuery(), staleTime: Infinity }),
                client.query({ ...favouriteFactionsQuery(), staleTime: Infinity }),
                client.query({ ...favouriteDetachmentsQuery(), staleTime: Infinity }),
                client.query({ ...favouriteDatasheetsQuery(), staleTime: Infinity }),
                client.query({ ...recentMatchupsQuery(), staleTime: Infinity }),
                client.query({ ...abilityRemindersQuery(), staleTime: Infinity }),
                client.query({ ...savedRosterSummariesQuery(), staleTime: Infinity }).then(async (summaries) => {
                  await prepareRosters(client, summaries, () => stillSignedInAs(me.id))
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
        if (Date.now() - refreshedAt >= FOREGROUND_REFRESH_MS) void refresh()
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
        const current = client.getQueryData<{ id: string } | null>(meKey())
        if (current !== undefined && (current?.id ?? null) !== window.PraetoriumAppSnapshot.owner) void clearSavedApp().catch(() => {})
        else restoreAppSnapshot(client, window.PraetoriumAppSnapshot)
      }
      ready = true
      save()
    })
    const cancelPreparation = afterInitialScreen(router, () => void refresh(), 10_000)
    window.addEventListener('online', reconnect)
    window.addEventListener('pagehide', save)
    window.addEventListener('storage', accountChanged)
    document.addEventListener('visibilitychange', foreground)
    return () => {
      cancelInitial()
      cancelPreparation()
      save()
      active = false
      clearTimeout(timer)
      unsubscribe()
      window.removeEventListener('online', reconnect)
      window.removeEventListener('pagehide', save)
      window.removeEventListener('storage', accountChanged)
      document.removeEventListener('visibilitychange', foreground)
    }
  }, [client, router])
  return null
}

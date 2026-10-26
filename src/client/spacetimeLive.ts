import { useQuery, useQueryClient } from '@tanstack/react-query'
import { posthog } from 'posthog-js'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { IdentityChangedError, setGlobalLogLevel } from 'spacetimedb'
import { z } from 'zod'
import { DbConnection, tables } from '../spacetime/generated'
import { battleQuery, battlesQuery } from './queries'
import { maintainSpacetimeConnection, type SpacetimeLink } from './spacetimeConnection'
import {
  coalescedBy,
  invalidateAdminProductQueries,
  invalidateEveryProductQuery,
  invalidateProductQueries,
  invalidatePublicProductQueries,
} from './productSignals'
import { setLiveProductRefresh } from './liveProductRefresh'
import { spacetimeBrowserUri } from './spacetimeBrowserUri'
import { isExpectedRealtimeDisconnect, RealtimeHttpError } from './realtimeErrors'
import { anySignal } from './abortSignals'
import { meKey, realtimeModeKey, reportKey } from './queries/queryKeys'

export function useRealtimeConfig() {
  const { data, error } = useQuery({
    queryKey: realtimeModeKey(),
    queryFn: async ({ signal }) => {
      const response = await fetch('/api/realtime/mode', { signal: anySignal([signal, AbortSignal.timeout(10_000)]) })
      if (!response.ok) throw new RealtimeHttpError('Realtime mode', response.status)
      const parsed = z.object({ mode: z.literal('spacetime'), database: z.string().min(1), uri: z.url() }).parse(await response.json())
      return { ...parsed, uri: spacetimeBrowserUri(parsed.uri, window.location.origin) }
    },
    staleTime: Infinity,
  })
  useEffect(() => {
    if (error) report(error)
  }, [error])
  return data ?? null
}

type RealtimeConfig = NonNullable<ReturnType<typeof useRealtimeConfig>>

const ticketSchema = z.object({
  token: z.string().min(1),
  database: z.string().min(1),
  uri: z.url(),
  battleId: z.string().nullable(),
})

async function ticket(battle?: string) {
  const url = battle ? `/api/spacetime/token?battle=${encodeURIComponent(battle)}` : '/api/spacetime/token'
  const response = await fetch(url, { cache: 'no-store' })
  if (!response.ok) throw new RealtimeHttpError('Spacetime token', response.status)
  const issued = ticketSchema.parse(await response.json())
  return { ...issued, uri: spacetimeBrowserUri(issued.uri, window.location.origin) }
}

async function guestTicket(config: RealtimeConfig) {
  const response = await fetch(new URL('v1/identity', config.uri), { method: 'POST', cache: 'no-store' })
  // A browser always POSTs here: a 404 means the client resent it as a GET, as some crawlers do, and a 403 is the edge
  // refusing the client. Asking again gets the same answer, so the page polls instead.
  if (response.status === 403 || response.status === 404) return null
  if (!response.ok) throw new RealtimeHttpError('Spacetime guest token', response.status)
  const { token } = z.object({ token: z.string().min(1) }).parse(await response.json())
  return { token, database: config.database, uri: config.uri, battleId: null }
}

function report(error: unknown) {
  if (isExpectedRealtimeDisconnect(error)) return
  posthog.captureException(error, { operation: 'spacetime_realtime' })
  console.error({ event: 'spacetime_realtime_failed', error })
}

type Ticket = { token: string; database: string; uri: string }

/** The SDK rides out a dropped socket on its own; the loop replaces the connection only once it gives up. */
function connection<T extends Ticket>(issued: T, link: SpacetimeLink<T>, identityChanged?: () => void) {
  // The SDK logs every connect at info through console.log, which console capture records; failures reach report().
  setGlobalLogLevel('warn')
  return DbConnection.builder()
    .withUri(issued.uri)
    .withDatabaseName(issued.database)
    .withToken(issued.token)
    .withAutomaticReconnect()
    .withTokenProvider(async () => (await link.renew()).token)
    .onDisconnect((_current, _error, retrying) => (retrying === undefined ? link.failed() : link.interrupted()))
    .onConnectError((_current, error, retrying) => {
      if (error instanceof IdentityChangedError) identityChanged?.()
      if (retrying === undefined) link.failed(error)
      else link.interrupted(error)
    })
}

export function useSpacetimeLiveBattle(token: string, enabled: boolean) {
  const queryClient = useQueryClient()
  const [subscribed, setSubscribed] = useState(false)
  const refresh = useCallback(
    (seq?: number) => {
      if (seq !== undefined) {
        const held = queryClient.getQueryData(battleQuery(token).queryKey) as { kind?: string; view?: { seq?: number } } | undefined
        if (held?.kind === 'battle' && typeof held.view?.seq === 'number' && held.view.seq >= seq) {
          void queryClient.invalidateQueries({ queryKey: battlesQuery().queryKey })
          return
        }
      }
      void queryClient.invalidateQueries({ queryKey: battleQuery(token).queryKey })
      void queryClient.invalidateQueries({ queryKey: battlesQuery().queryKey })
      void queryClient.invalidateQueries({ queryKey: reportKey(token) })
    },
    [queryClient, token],
  )

  useEffect(() => {
    if (!enabled) return
    let leaving = false
    const stop = maintainSpacetimeConnection({
      issue: async () => {
        // A viewer who is not seated is refused every time, so the battle polls instead of asking again.
        const issued = await ticket(token).catch((error: unknown) => {
          if (error instanceof RealtimeHttpError && [401, 403, 404].includes(error.status)) return null
          throw error
        })
        const battleId = issued?.battleId
        return issued && battleId ? { ...issued, battleId } : null
      },
      open: (issued, link) => {
        const { failed, isCurrent, ready } = link
        const battleId = issued.battleId
        const opened = connection(issued, link)
          .onConnect((current) => {
            if (!isCurrent()) return
            current.db.mySession.onDelete(() => failed())
            current.db.myBattleSignals.onInsert((_context, row) => {
              if (row.battleId === battleId) refresh(row.seq)
            })
            current.db.myBattleSignals.onUpdate((_context, _previous, row) => {
              if (row.battleId === battleId) refresh(row.seq)
            })
            // The row leaves when the battle is deleted or this player loses their seat, so the screen asks again.
            current.db.myBattleSignals.onDelete((_context, row) => {
              if (row.battleId === battleId) refresh()
            })
            current
              .subscriptionBuilder()
              .onApplied(() => {
                if (!isCurrent()) return
                ready()
                setSubscribed(true)
                refresh(Array.from(current.db.myBattleSignals.iter()).find((row) => row.battleId === battleId)?.seq)
                void current.reducers.watchBattle({ battleId }).catch(report)
              })
              .onError((context) => failed(new Error(context.event?.message || 'Battle subscription failed')))
              .subscribe([tables.mySession, tables.myBattleSignals])
          })
          .build()
        return {
          disconnect: () => {
            if (!leaving) return opened.disconnect()
            // The server keeps a watch until the session lapses and caps how many one session holds, so leaving gives it back.
            // A connection that is offline or closed refuses the call, and its watch lapses with the session instead.
            void opened.reducers
              .unwatchBattle({ battleId })
              .catch(() => undefined)
              .finally(() => opened.disconnect())
          },
        }
      },
      inactive: () => setSubscribed(false),
      report,
    })
    return () => {
      leaving = true
      stop()
    }
  }, [enabled, refresh, token])

  useEffect(() => {
    if (!enabled || subscribed) return
    const timer = window.setInterval(() => refresh(), 5_000)
    return () => window.clearInterval(timer)
  }, [enabled, refresh, subscribed])
}

/** The shortest gap between two refetches of one signal scope. */
const SIGNAL_WINDOW_MS = 10_000

export function useSpacetimeLiveProduct(config: RealtimeConfig | null, signedIn: boolean) {
  const queryClient = useQueryClient()
  const [subscribed, setSubscribed] = useState(false)
  const enabled = Boolean(config)
  const refresh = useMemo(
    () => coalescedBy(SIGNAL_WINDOW_MS, (scope?: string) => void invalidateProductQueries(queryClient, scope)),
    [queryClient],
  )
  const refreshPublic = useMemo(
    () => coalescedBy(SIGNAL_WINDOW_MS, (scope?: string) => void invalidatePublicProductQueries(queryClient, scope)),
    [queryClient],
  )
  useEffect(
    () => () => {
      refresh.cancel()
      refreshPublic.cancel()
    },
    [refresh, refreshPublic],
  )
  // Either the signals or the fallback refresh below keeps product data current, so feeds need no timer of their own.
  useEffect(() => {
    if (!enabled) return
    setLiveProductRefresh(true)
    return () => setLiveProductRefresh(false)
  }, [enabled])
  const refreshAdmin = useCallback(
    (scope?: string) => {
      void invalidateAdminProductQueries(queryClient, scope)
    },
    [queryClient],
  )

  useEffect(() => {
    if (!config) return
    // Revisions seen by earlier connections, so a reconnect refreshes only what changed while it was away.
    const seen = { product: new Map<string, bigint>(), admin: new Map<string, bigint>(), public: new Map<string, bigint>() }
    let synced = false
    const catchUp = (
      revisions: Map<string, bigint>,
      rows: Iterable<{ scope: string; revision: bigint }>,
      run: (scope?: string) => void,
      first: boolean,
    ) => {
      for (const { scope, revision } of rows) {
        if (!first && revisions.get(scope) !== revision) run(scope)
        revisions.set(scope, revision)
      }
    }
    return maintainSpacetimeConnection({
      // Session rotation deletes its row before the new cookie arrives; only a ticket 401 rechecks authentication.
      issue: signedIn
        ? () =>
            ticket().catch((error: unknown) => {
              if (error instanceof RealtimeHttpError && error.status === 401) {
                void queryClient.invalidateQueries({ queryKey: meKey() })
              }
              throw error
            })
        : () => guestTicket(config),
      open: (issued, link) => {
        const { failed, isCurrent, ready } = link
        // A reconnect ticket for another session means the account changed in another tab, so this one reads it again.
        return connection(issued, link, () => void queryClient.invalidateQueries({ queryKey: meKey() }))
          .onConnect((current) => {
            if (!isCurrent()) return
            let applied = false
            if (signedIn) current.db.mySession.onDelete(() => failed())
            const signal =
              (revisions: Map<string, bigint>, run: (scope?: string) => void, listening = true) =>
              (row: { scope: string; revision: bigint }) => {
                // The subscription can replay rows its catch-up already read; an unchanged revision has nothing new.
                if (!applied || !listening || revisions.get(row.scope) === row.revision) return
                revisions.set(row.scope, row.revision)
                run(row.scope)
              }
            const product = signal(seen.product, refresh, signedIn)
            const admin = signal(seen.admin, refreshAdmin, signedIn)
            const publicSignal = signal(seen.public, refreshPublic)
            current.db.myProductSignals.onInsert((_context, row) => product(row))
            current.db.myProductSignals.onUpdate((_context, _old, row) => product(row))
            current.db.myAdminSignals.onInsert((_context, row) => admin(row))
            current.db.myAdminSignals.onUpdate((_context, _old, row) => admin(row))
            current.db.publicProductSignals.onInsert((_context, row) => publicSignal(row))
            current.db.publicProductSignals.onUpdate((_context, _old, row) => publicSignal(row))
            current
              .subscriptionBuilder()
              .onApplied(() => {
                if (!isCurrent()) return
                applied = true
                ready()
                setSubscribed(true)
                const first = !synced
                synced = true
                if (first) void invalidateEveryProductQuery(queryClient, signedIn)
                if (first && signedIn) refreshAdmin()
                if (signedIn) catchUp(seen.product, current.db.myProductSignals.iter(), refresh, first)
                if (signedIn) catchUp(seen.admin, current.db.myAdminSignals.iter(), refreshAdmin, first)
                catchUp(seen.public, current.db.publicProductSignals.iter(), refreshPublic, first)
              })
              .onError((context) => failed(new Error(context.event?.message || 'Product subscription failed')))
              .subscribe(
                signedIn
                  ? [tables.mySession, tables.myProductSignals, tables.myAdminSignals, tables.publicProductSignals]
                  : [tables.publicProductSignals],
              )
          })
          .build()
      },
      inactive: () => setSubscribed(false),
      report,
      // Host-issued anonymous tokens do not expire; issuing another creates a different identity.
      expires: signedIn,
    })
  }, [config, queryClient, refresh, refreshAdmin, refreshPublic, signedIn])

  useEffect(() => {
    if (!enabled || subscribed) return
    const timer = window.setInterval(() => {
      void invalidateEveryProductQuery(queryClient, signedIn)
      if (signedIn) refreshAdmin()
    }, 20_000)
    return () => window.clearInterval(timer)
  }, [enabled, queryClient, refreshAdmin, signedIn, subscribed])
}

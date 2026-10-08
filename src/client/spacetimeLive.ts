import { useQuery, useQueryClient } from '@tanstack/react-query'
import { posthog } from 'posthog-js'
import { useCallback, useEffect, useState } from 'react'
import { z } from 'zod'
import { DbConnection, tables } from '../spacetime/generated'
import { battleQuery, battlesQuery } from './queries'
import { maintainSpacetimeConnection } from './spacetimeConnection'
import { invalidateAdminProductQueries, invalidateProductQueries, invalidatePublicProductQueries } from './productSignals'
import { spacetimeBrowserUri } from './spacetimeBrowserUri'
import { isExpectedRealtimeDisconnect, RealtimeHttpError } from './realtimeErrors'
import { anySignal } from './abortSignals'

export function useRealtimeConfig() {
  const { data, error } = useQuery({
    queryKey: ['realtime-mode'],
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
  if (!response.ok) throw new RealtimeHttpError('Spacetime guest token', response.status)
  const { token } = z.object({ token: z.string().min(1) }).parse(await response.json())
  return { token, database: config.database, uri: config.uri, battleId: null }
}

function report(error: unknown) {
  if (isExpectedRealtimeDisconnect(error)) return
  posthog.captureException(error, { operation: 'spacetime_realtime' })
  console.error({ event: 'spacetime_realtime_failed', error })
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
      void queryClient.invalidateQueries({ queryKey: ['report', token] })
    },
    [queryClient, token],
  )

  useEffect(() => {
    if (!enabled) return
    return maintainSpacetimeConnection({
      issue: async () => {
        const issued = await ticket(token)
        const battleId = issued.battleId
        return battleId ? { ...issued, battleId } : null
      },
      open: (issued, failed, isCurrent, ready) => {
        const battleId = issued.battleId
        return DbConnection.builder()
          .withUri(issued.uri)
          .withDatabaseName(issued.database)
          .withToken(issued.token)
          .onConnect((current) => {
            if (!isCurrent()) return
            current.db.mySession.onDelete(() => failed())
            current.db.myBattleSignals.onInsert((_context, row) => {
              if (row.battleId === battleId) refresh(row.seq)
            })
            current.db.myBattleSignals.onUpdate((_context, _previous, row) => {
              if (row.battleId === battleId) refresh(row.seq)
            })
            current
              .subscriptionBuilder()
              .onApplied(() => {
                if (!isCurrent()) return
                ready()
                setSubscribed(true)
                refresh()
                void current.reducers.watchBattle({ battleId }).catch(report)
              })
              .onError((context) => failed(new Error(context.event?.message || 'Battle subscription failed')))
              .subscribe([tables.mySession, tables.myBattleSignals])
          })
          .onDisconnect(() => failed())
          .onConnectError((_current, error) => failed(error))
          .build()
      },
      inactive: () => setSubscribed(false),
      report,
    })
  }, [enabled, refresh, token])

  useEffect(() => {
    if (!enabled || subscribed) return
    const timer = window.setInterval(() => refresh(), 5_000)
    return () => window.clearInterval(timer)
  }, [enabled, refresh, subscribed])
}

export function useSpacetimeLiveProduct(config: RealtimeConfig | null, signedIn: boolean) {
  const queryClient = useQueryClient()
  const [subscribed, setSubscribed] = useState(false)
  const enabled = Boolean(config)
  const refresh = useCallback(
    (scope?: string) => {
      void invalidateProductQueries(queryClient, scope)
    },
    [queryClient],
  )
  const refreshPublic = useCallback(
    (scope?: string) => {
      void invalidatePublicProductQueries(queryClient, scope)
    },
    [queryClient],
  )
  const refreshAdmin = useCallback(
    (scope?: string) => {
      void invalidateAdminProductQueries(queryClient, scope)
    },
    [queryClient],
  )

  useEffect(() => {
    if (!config) return
    return maintainSpacetimeConnection({
      // Session rotation deletes its row before the new cookie arrives; only a ticket 401 rechecks authentication.
      issue: signedIn
        ? () =>
            ticket().catch((error: unknown) => {
              if (error instanceof RealtimeHttpError && error.status === 401) {
                void queryClient.invalidateQueries({ queryKey: ['me'] })
              }
              throw error
            })
        : () => guestTicket(config),
      open: (issued, failed, isCurrent, ready) =>
        DbConnection.builder()
          .withUri(issued.uri)
          .withDatabaseName(issued.database)
          .withToken(issued.token)
          .onConnect((current) => {
            if (!isCurrent()) return
            let applied = false
            if (signedIn) current.db.mySession.onDelete(() => failed())
            current.db.myProductSignals.onInsert((_context, row) => {
              if (applied && signedIn) refresh(row.scope)
            })
            current.db.myProductSignals.onUpdate((_context, _old, row) => {
              if (applied && signedIn) refresh(row.scope)
            })
            current.db.myAdminSignals.onInsert((_context, row) => {
              if (applied && signedIn) refreshAdmin(row.scope)
            })
            current.db.myAdminSignals.onUpdate((_context, _old, row) => {
              if (applied && signedIn) refreshAdmin(row.scope)
            })
            current.db.publicProductSignals.onInsert((_context, row) => {
              if (applied) refreshPublic(row.scope)
            })
            current.db.publicProductSignals.onUpdate((_context, _old, row) => {
              if (applied) refreshPublic(row.scope)
            })
            current
              .subscriptionBuilder()
              .onApplied(() => {
                if (!isCurrent()) return
                applied = true
                ready()
                setSubscribed(true)
                if (signedIn) refresh()
                if (signedIn) refreshAdmin()
                refreshPublic()
              })
              .onError((context) => failed(new Error(context.event?.message || 'Product subscription failed')))
              .subscribe(
                signedIn
                  ? [tables.mySession, tables.myProductSignals, tables.myAdminSignals, tables.publicProductSignals]
                  : [tables.publicProductSignals],
              )
          })
          .onDisconnect(() => failed())
          .onConnectError((_current, error) => failed(error))
          .build(),
      inactive: () => setSubscribed(false),
      report,
    })
  }, [config, queryClient, refresh, refreshAdmin, refreshPublic, signedIn])

  useEffect(() => {
    if (!enabled || subscribed) return
    const timer = window.setInterval(() => {
      if (signedIn) refresh()
      if (signedIn) refreshAdmin()
      refreshPublic()
    }, 20_000)
    return () => window.clearInterval(timer)
  }, [enabled, refresh, refreshAdmin, refreshPublic, signedIn, subscribed])
}

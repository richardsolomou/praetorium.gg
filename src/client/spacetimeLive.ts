import { useQueryClient } from '@tanstack/react-query'
import { posthog } from 'posthog-js'
import { useCallback, useEffect, useState } from 'react'
import { z } from 'zod'
import { DbConnection, tables } from '../spacetime/generated'
import { battleQuery, battlesQuery } from './queries'
import { maintainSpacetimeConnection } from './spacetimeConnection'

type RealtimeMode = 'centrifugo' | 'spacetime'
let modePromise: Promise<RealtimeMode> | null = null

export function useRealtimeMode() {
  const [mode, setMode] = useState<RealtimeMode | null>(null)
  useEffect(() => {
    let active = true
    modePromise ??= fetch('/api/realtime/mode')
      .then((response) => {
        if (!response.ok) throw new Error(`Realtime mode failed with HTTP ${response.status}`)
        return response.json()
      })
      .then((value: unknown) => z.object({ mode: z.enum(['centrifugo', 'spacetime']) }).parse(value).mode)
      .catch((error: unknown) => {
        modePromise = null
        throw error
      })
    void modePromise
      .then((value) => {
        if (active) setMode(value)
      })
      .catch(report)
    return () => {
      active = false
    }
  }, [])
  return mode
}

const ticketSchema = z.object({
  token: z.string().min(1),
  database: z.string().min(1),
  uri: z.url(),
  battleId: z.string().nullable(),
})

async function ticket(battle?: string) {
  const url = battle ? `/api/spacetime/token?battle=${encodeURIComponent(battle)}` : '/api/spacetime/token'
  const response = await fetch(url, { cache: 'no-store' })
  if (!response.ok) throw new Error(`Spacetime token failed with HTTP ${response.status}`)
  return ticketSchema.parse(await response.json())
}

function report(error: unknown) {
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
      open: (issued, failed, isCurrent) => {
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

export function useSpacetimeLiveBattles(enabled: boolean) {
  const queryClient = useQueryClient()
  const [subscribed, setSubscribed] = useState(false)
  const refresh = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: battlesQuery().queryKey })
  }, [queryClient])
  useEffect(() => {
    if (!enabled) return
    return maintainSpacetimeConnection({
      issue: ticket,
      open: (issued, failed, isCurrent) =>
        DbConnection.builder()
          .withUri(issued.uri)
          .withDatabaseName(issued.database)
          .withToken(issued.token)
          .onConnect((current) => {
            if (!isCurrent()) return
            current.db.mySession.onDelete(() => failed())
            current.db.myBattleList.onInsert(refresh)
            current.db.myBattleList.onUpdate(refresh)
            current.db.myBattleList.onDelete(refresh)
            current
              .subscriptionBuilder()
              .onApplied(() => {
                if (isCurrent()) {
                  setSubscribed(true)
                  refresh()
                }
              })
              .onError((context) => failed(new Error(context.event?.message || 'Battle list subscription failed')))
              .subscribe([tables.mySession, tables.myBattleList])
          })
          .onDisconnect(() => failed())
          .onConnectError((_current, error) => failed(error))
          .build(),
      inactive: () => setSubscribed(false),
      report,
    })
  }, [enabled, refresh])

  useEffect(() => {
    if (!enabled || subscribed) return
    const timer = window.setInterval(refresh, 5_000)
    return () => window.clearInterval(timer)
  }, [enabled, refresh, subscribed])
}

import { useQueryClient } from '@tanstack/react-query'
import posthog from 'posthog-js'
import {
  SubscriptionState,
  UnauthorizedError,
  type Centrifuge,
  type Subscription,
  type SubscriptionOptions,
  type SubscriptionStateContext,
} from 'centrifuge'
import { createSameOriginRealtimeClient, requestRealtimeTicket } from 'ras-stack/realtime/client'
import { useConnectedRealtimeClient, useRealtimeSubscription } from 'ras-stack/realtime/react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { z } from 'zod'
import { battleQuery, battlesQuery } from './queries'
import { isExpectedRealtimeDisconnect } from './realtimeErrors'

const TICKET = z.object({ token: z.string(), channel: z.string().optional() })
const clientChannels = new WeakMap<Centrifuge, string>()
const reportRealtimeError = (error: unknown) => {
  if (isExpectedRealtimeDisconnect(error)) {
    console.info({ event: 'realtime_disconnected', error })
    return
  }
  posthog.captureException(error, { operation: 'realtime' })
  console.error({ event: 'realtime_failed', error })
}

/**
 * Keeps an open battle current.
 *
 * Messages only prompt the normal read, so `battleView` stays authoritative.
 * Subscribing refetches, and polling continues until the battle channel is subscribed.
 */
export function useLiveBattle(token: string, enabled: boolean) {
  const queryClient = useQueryClient()
  const [subscribed, setSubscribed] = useState(false)
  const [retry, setRetry] = useState(0)
  const retryTimer = useRef<number | undefined>(undefined)
  const ask = useCallback(
    (init?: RequestInit) =>
      requestRealtimeTicket(`/api/realtime/token?battle=${encodeURIComponent(token)}`, {
        init,
        parse: (value) => TICKET.parse(value),
      }),
    [token],
  )
  const createClient = useCallback(async () => {
    const { token: connection, channel } = await ask(retry ? { cache: 'no-store' } : undefined)
    if (!channel) throw new Error('Realtime ticket did not include a battle channel')
    const client = createSameOriginRealtimeClient({ token: connection, getToken: async () => (await ask()).token })
    clientChannels.set(client, channel)
    return client
  }, [ask, retry])
  const handleRealtimeError = useCallback((error: unknown) => {
    reportRealtimeError(error)
    if (error instanceof UnauthorizedError) return
    window.clearTimeout(retryTimer.current)
    retryTimer.current = window.setTimeout(() => setRetry((current) => current + 1), 5_000)
  }, [])
  useEffect(() => () => window.clearTimeout(retryTimer.current), [])
  const client = useConnectedRealtimeClient(createClient, enabled, { onError: handleRealtimeError })
  const refresh = useCallback(
    (announcedSeq?: number) => {
      if (announcedSeq !== undefined) {
        const held = queryClient.getQueryData(battleQuery(token).queryKey) as { kind?: string; view?: { seq?: number } } | undefined
        if (held?.kind === 'battle' && typeof held.view?.seq === 'number' && held.view.seq >= announcedSeq) {
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
    if (!enabled || subscribed) return
    const timer = window.setInterval(refresh, 5_000)
    return () => window.clearInterval(timer)
  }, [enabled, refresh, subscribed])
  const subscriptionOptions = useMemo<SubscriptionOptions>(
    () => ({
      getToken: async ({ channel }) =>
        (
          await ask({
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ channel }),
          })
        ).token,
    }),
    [ask],
  )
  const configure = useCallback(
    (subscription: Subscription) => {
      const state = ({ newState }: SubscriptionStateContext) => setSubscribed(newState === SubscriptionState.Subscribed)
      const publication = (context: { data?: unknown }) => {
        const seq = (context.data as { seq?: unknown } | undefined)?.seq
        refresh(typeof seq === 'number' ? seq : undefined)
      }
      const onSubscribed = () => refresh()
      subscription.on('state', state)
      subscription.on('publication', publication)
      subscription.on('subscribed', onSubscribed)
      setSubscribed(subscription.state === SubscriptionState.Subscribed)
      return () => {
        subscription.off('state', state)
        subscription.off('publication', publication)
        subscription.off('subscribed', onSubscribed)
        setSubscribed(false)
      }
    },
    [refresh],
  )
  useRealtimeSubscription({
    client,
    channel: client ? clientChannels.get(client) : undefined,
    options: subscriptionOptions,
    configure,
  })
}

/**
 * Keeps the list of battles current.
 *
 * The same nudge-then-refetch as an open battle, on a channel named after the user
 * rather than a battle: being added to one has to reach a page that is not watching
 * it yet, and the list is exactly that page.
 */
export function useLiveBattles(enabled: boolean) {
  const queryClient = useQueryClient()
  const ask = useCallback(
    (init?: RequestInit) => requestRealtimeTicket('/api/realtime/token', { init, parse: (value) => TICKET.parse(value) }),
    [],
  )
  const createClient = useCallback(async () => {
    const { token: connection, channel } = await ask()
    if (!channel) throw new Error('Realtime ticket did not include a user channel')
    const client = createSameOriginRealtimeClient({ token: connection, getToken: async () => (await ask()).token })
    clientChannels.set(client, channel)
    return client
  }, [ask])
  const client = useConnectedRealtimeClient(createClient, enabled, { onError: reportRealtimeError })
  const refresh = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: battlesQuery().queryKey })
  }, [queryClient])
  const options = useMemo<SubscriptionOptions>(
    () => ({
      getToken: async ({ channel }) =>
        (
          await ask({
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ channel }),
          })
        ).token,
    }),
    [ask],
  )
  const configure = useCallback(
    (subscription: Subscription) => {
      subscription.on('publication', refresh)
      subscription.on('subscribed', refresh)
      return () => {
        subscription.off('publication', refresh)
        subscription.off('subscribed', refresh)
      }
    },
    [refresh],
  )
  useRealtimeSubscription({ client, channel: client ? clientChannels.get(client) : undefined, options, configure })
}

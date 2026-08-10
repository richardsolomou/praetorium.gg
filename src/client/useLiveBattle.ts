import { useQueryClient } from '@tanstack/react-query'
import type { Centrifuge, Subscription, SubscriptionOptions } from 'centrifuge'
import { createSameOriginRealtimeClient, requestRealtimeTicket } from 'ras-stack/realtime/client'
import { useConnectedRealtimeClient, useRealtimePresence, useRealtimeSubscription } from 'ras-stack/realtime/react'
import { useCallback, useMemo } from 'react'
import { z } from 'zod'
import { battleQuery } from './queries'

export type PresentPlayer = { playerId: string; name: string }

const TICKET = z.object({ token: z.string(), channel: z.string().optional() })
const clientChannels = new WeakMap<Centrifuge, string>()
const reportRealtimeError = (error: unknown) => console.error({ event: 'realtime_failed', error })

/**
 * Keeps an open battle current, and reports who else has it open.
 *
 * The message carries nothing but the battle id and only prompts a refetch, so
 * `battleView` stays the only thing deciding what a player may see. A connection
 * that dies costs only freshness: subscribing refetches, which covers whatever
 * changed while it was down.
 *
 * Presence is Centrifugo's rather than ours — arriving and leaving is a
 * subscription opening and closing, so there is nothing to expire.
 */
export function useLiveBattle(token: string, enabled: boolean) {
  const queryClient = useQueryClient()
  const ask = useCallback(
    (init?: RequestInit) =>
      requestRealtimeTicket(`/api/realtime/token?battle=${encodeURIComponent(token)}`, {
        init,
        parse: (value) => TICKET.parse(value),
      }),
    [token],
  )
  const createClient = useCallback(async () => {
    const { token: connection, channel } = await ask()
    if (!channel) throw new Error('Realtime ticket did not include a battle channel')
    const client = createSameOriginRealtimeClient({ token: connection, getToken: async () => (await ask()).token })
    clientChannels.set(client, channel)
    return client
  }, [ask])
  const client = useConnectedRealtimeClient(createClient, enabled, { onError: reportRealtimeError })
  const refresh = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: battleQuery(token).queryKey })
    void queryClient.invalidateQueries({ queryKey: ['report', token] })
  }, [queryClient, token])
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
      subscription.on('publication', refresh)
      subscription.on('subscribed', refresh)
      return () => {
        subscription.off('publication', refresh)
        subscription.off('subscribed', refresh)
      }
    },
    [refresh],
  )
  const subscription = useRealtimeSubscription({
    client,
    channel: client ? clientChannels.get(client) : undefined,
    options: subscriptionOptions,
    configure,
  })
  const clients = useRealtimePresence(subscription, { onError: reportRealtimeError })
  return useMemo(() => {
    const seen = new Map<string, PresentPlayer>()
    for (const { user, connInfo } of Object.values(clients)) {
      const named = z.object({ name: z.string() }).safeParse(connInfo)
      seen.set(user, { playerId: user, name: named.success ? named.data.name : 'Someone' })
    }
    return [...seen.values()]
  }, [clients])
}

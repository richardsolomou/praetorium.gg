import { useQueryClient } from '@tanstack/react-query'
import type { Centrifuge } from 'centrifuge'
import {
  connectRealtimeClient,
  createSameOriginRealtimeClient,
  openRealtimeSubscription,
  requestRealtimeTicket,
  watchSubscriptionPresence,
} from 'ras-stack/realtime/client'
import { useEffect, useState } from 'react'
import { z } from 'zod'
import { battleQuery } from './queries'

export type PresentPlayer = { playerId: string; name: string }

const TICKET = z.object({ token: z.string(), channel: z.string().optional() })

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
  const [present, setPresent] = useState<PresentPlayer[]>([])

  useEffect(() => {
    if (!enabled) return undefined
    let live = true
    let client: Centrifuge | undefined
    let closeRealtime: (() => void) | undefined

    const tokenUrl = `/api/realtime/token?battle=${encodeURIComponent(token)}`
    const ask = (init?: RequestInit) => requestRealtimeTicket(tokenUrl, { init, parse: (value) => TICKET.parse(value) })

    const refresh = () => {
      void queryClient.invalidateQueries({ queryKey: battleQuery(token).queryKey })
      void queryClient.invalidateQueries({ queryKey: ['report', token] })
    }

    const start = async () => {
      const { token: connection, channel } = await ask()
      if (!live) return
      client = createSameOriginRealtimeClient({ token: connection, getToken: async () => (await ask()).token })
      const liveSubscription = openRealtimeSubscription(
        client,
        channel!,
        {
          getToken: async ({ channel: requested }) =>
            (
              await ask({
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ channel: requested }),
              })
            ).token,
        },
        (subscription) => {
          const stopPresence = watchSubscriptionPresence(subscription, (clients) => {
            if (!live) return
            const seen = new Map<string, PresentPlayer>()
            for (const { user, connInfo } of Object.values(clients)) {
              const named = z.object({ name: z.string() }).safeParse(connInfo)
              seen.set(user, { playerId: user, name: named.success ? named.data.name : 'Someone' })
            }
            setPresent([...seen.values()])
          })
          subscription.on('publication', refresh)
          subscription.on('subscribed', refresh)
          return () => {
            subscription.off('publication', refresh)
            subscription.off('subscribed', refresh)
            stopPresence()
          }
        },
      )
      const disconnect = connectRealtimeClient(client)
      closeRealtime = () => {
        liveSubscription.close()
        disconnect()
      }
      if (!live) {
        closeRealtime()
      }
    }

    void start()
    return () => {
      live = false
      closeRealtime?.()
      client?.disconnect()
      setPresent([])
    }
  }, [token, enabled, queryClient])

  return present
}

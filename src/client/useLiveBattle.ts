import { useQueryClient } from '@tanstack/react-query'
import { Centrifuge, UnauthorizedError } from 'centrifuge'
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

    const tokenUrl = `/api/realtime/token?battle=${encodeURIComponent(token)}`
    const ask = async (init?: RequestInit) => {
      const response = await fetch(tokenUrl, init)
      if (response.status === 401 || response.status === 403) throw new UnauthorizedError('unauthorized')
      if (!response.ok) throw new Error(`realtime authentication failed with status ${response.status}`)
      return TICKET.parse(await response.json())
    }

    const refresh = () => {
      void queryClient.invalidateQueries({ queryKey: battleQuery(token).queryKey })
      void queryClient.invalidateQueries({ queryKey: ['report', token] })
    }

    const start = async () => {
      const { token: connection, channel } = await ask()
      if (!live) return
      // Always this origin: Caddy puts Centrifugo behind it in the container, and
      // the dev server proxies it. Nothing here ever crosses an origin.
      const endpoint = `${window.location.protocol === 'https:' ? 'wss' : 'ws'}://${window.location.host}/connection/websocket`

      client = new Centrifuge(endpoint, { token: connection, getToken: async () => (await ask()).token })
      const subscription = client.newSubscription(channel!, {
        getToken: async ({ channel: requested }) =>
          (
            await ask({
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ channel: requested }),
            })
          ).token,
      })

      const readPresence = () => {
        void subscription.presence().then(({ clients }) => {
          if (!live) return
          const seen = new Map<string, PresentPlayer>()
          for (const { user, connInfo } of Object.values(clients)) {
            const named = z.object({ name: z.string() }).safeParse(connInfo)
            seen.set(user, { playerId: user, name: named.success ? named.data.name : 'Someone' })
          }
          setPresent([...seen.values()])
        })
      }

      subscription.on('publication', refresh)
      subscription.on('subscribed', () => {
        refresh()
        readPresence()
      })
      subscription.on('join', readPresence)
      subscription.on('leave', readPresence)
      subscription.subscribe()
      client.connect()
    }

    void start()
    return () => {
      live = false
      client?.disconnect()
      setPresent([])
    }
  }, [token, enabled, queryClient])

  return present
}

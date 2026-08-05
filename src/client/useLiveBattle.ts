import { useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import type { PresentPlayer } from '../server/presence'
import { battleQuery } from './queries'

/**
 * Keeps an open battle current, and reports who else has it open.
 *
 * The `change` message carries nothing and only prompts a refetch, so
 * `battleView` stays the only thing deciding what a player may see. A stream that
 * dies costs only freshness: `open` refetches, which covers whatever changed
 * while it was down.
 */
export function useLiveBattle(token: string, enabled: boolean) {
  const queryClient = useQueryClient()
  const [present, setPresent] = useState<PresentPlayer[]>([])

  useEffect(() => {
    if (!enabled) return undefined
    const events = new EventSource(`/api/events?battle=${encodeURIComponent(token)}`)
    const refresh = () => {
      void queryClient.invalidateQueries({ queryKey: battleQuery(token).queryKey })
      void queryClient.invalidateQueries({ queryKey: ['report', token] })
    }
    events.addEventListener('open', refresh)
    events.addEventListener('change', refresh)
    events.addEventListener('presence', (message: MessageEvent<string>) => {
      setPresent(JSON.parse(message.data))
    })
    return () => {
      events.close()
      setPresent([])
    }
  }, [token, enabled, queryClient])

  return present
}

import { useCallback, useSyncExternalStore } from 'react'

/** Whether `query` matches, re-rendering as it changes; `server` on the server and while hydrating. */
export function useMediaQuery(query: string, server = false) {
  const subscribe = useCallback(
    (changed: () => void) => {
      const list = window.matchMedia(query)
      list.addEventListener('change', changed)
      return () => list.removeEventListener('change', changed)
    },
    [query],
  )
  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(query).matches,
    () => server,
  )
}

/** Whether the reader has asked for less motion, read at the moment of a scroll or animation. */
export const prefersReducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches

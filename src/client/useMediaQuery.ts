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

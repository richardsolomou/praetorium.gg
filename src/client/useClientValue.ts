import { useSyncExternalStore } from 'react'

const unchanging = () => () => {}

/** `server` on the server and while hydrating, then the browser's value, which does not change while the page is open. */
export function useClientValue<T>(read: () => T, server: T) {
  return useSyncExternalStore(unchanging, read, () => server)
}

const inBrowser = () => true

/** False on the server and while hydrating, so browser-only work waits for the browser's first render. */
export const useHydrated = () => useClientValue(inBrowser, false)

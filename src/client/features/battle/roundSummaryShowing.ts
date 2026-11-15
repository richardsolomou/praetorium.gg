import { useSyncExternalStore } from 'react'

let showing = false
const listeners = new Set<() => void>()

/** Whether a round summary covers the screen; announcements wait for it, so a stack of them never sits on its button. */
export function setRoundSummaryShowing(next: boolean) {
  if (next === showing) return
  showing = next
  for (const listener of listeners) listener()
}

export const useRoundSummaryShowing = () =>
  useSyncExternalStore(
    (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    () => showing,
    () => false,
  )

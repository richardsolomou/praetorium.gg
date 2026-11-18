import { useSyncExternalStore } from 'react'
import type { TextSource } from '../../core/sourceText'

/** Whether the one dialog every prompt opens is showing, and the source the prompt that opened it needs. */
let request: { source?: TextSource } | null = null
const listeners = new Set<() => void>()
const set = (next: typeof request) => {
  request = next
  for (const listener of listeners) listener()
}
const subscribe = (listener: () => void) => {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/**
 * Asks the reader which external sources to load; the same question wherever it is asked.
 * A prompt that knows its source marks it, but the reader still turns it on themselves.
 */
export const openTextSourcesDialog = (source?: TextSource) => {
  set({ source })
}

export const closeTextSourcesDialog = () => set(null)
export const useTextSourcesDialog = () =>
  useSyncExternalStore(
    subscribe,
    () => request,
    () => null,
  )

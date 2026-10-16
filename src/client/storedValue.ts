import { useSyncExternalStore } from 'react'

const STORED_VALUE_EVENT = 'praetorium-stored-value'
/** What this page wrote, which stays readable when browser storage refuses a write. */
const written = new Map<string, string | null>()

/** For event handlers that need the latest value, including writes earlier in the same handler. */
export function readStoredValue(key: string) {
  if (written.has(key)) return written.get(key) ?? null
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

/** Stores `value`, or removes the entry for null, and says whether browser storage kept it beyond this page. */
export function writeStoredValue(key: string, value: string | null) {
  written.set(key, value)
  let kept = true
  try {
    if (value === null) localStorage.removeItem(key)
    else localStorage.setItem(key, value)
  } catch {
    kept = false
  }
  window.dispatchEvent(new CustomEvent(STORED_VALUE_EVENT, { detail: key }))
  return kept
}

function subscribe(changed: () => void) {
  const fromOtherTab = (event: StorageEvent) => {
    if (event.key !== null) written.delete(event.key)
    changed()
  }
  window.addEventListener('storage', fromOtherTab)
  window.addEventListener(STORED_VALUE_EVENT, changed)
  return () => {
    window.removeEventListener('storage', fromOtherTab)
    window.removeEventListener(STORED_VALUE_EVENT, changed)
  }
}

/** A browser storage entry as rendering state: null on the server and while hydrating, then current in every tab. */
export function useStoredValue(key: string) {
  return useSyncExternalStore(
    subscribe,
    () => readStoredValue(key),
    () => null,
  )
}

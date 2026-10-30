import { useSyncExternalStore } from 'react'
import type { z } from 'zod'

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

/** Calls `changed` after any stored value changes, in this tab or another. */
export function subscribeStoredValues(changed: () => void) {
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
    subscribeStoredValues,
    () => readStoredValue(key),
    () => null,
  )
}

/** A stored JSON value that `schema` accepts, or null when it is missing, malformed or of another shape. */
export function parseStored<Schema extends z.ZodType>(schema: Schema, raw: string | null): z.output<Schema> | null {
  if (raw === null) return null
  try {
    const parsed = schema.safeParse(JSON.parse(raw))
    return parsed.success ? parsed.data : null
  } catch {
    return null
  }
}

/** A value stored for this tab, or null on the server or when storage refuses to be read. */
export function readSessionValue(key: string) {
  if (typeof window === 'undefined') return null
  try {
    return sessionStorage.getItem(key)
  } catch {
    return null
  }
}

/** Stores a value for this tab, or removes it for null; a refused write only costs the tab that memory. */
export function writeSessionValue(key: string, value: string | null) {
  try {
    if (value === null) sessionStorage.removeItem(key)
    else sessionStorage.setItem(key, value)
  } catch {}
}

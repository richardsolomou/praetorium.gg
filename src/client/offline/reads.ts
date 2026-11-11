import { CancelledError, hashKey } from '@tanstack/react-query'
import { posthog } from 'posthog-js'
import { useSyncExternalStore } from 'react'
import { isFetchNetworkFailure } from '../networkErrors'
import { localClient, localEngine, localOwner } from './localRuntime'
import { OfflineRefusal } from './offlineRefusal'

/** A read finished for the account that just left: dropped like a cancelled read, so the screen loads again for the new one. */
export const accountChanged = () => new CancelledError({ revert: true, silent: true })

/** Throws `accountChanged` once the account or its local store differs from when the guard was made. */
export function accountGuard() {
  const owner = localOwner()?.id
  const engine = localEngine()
  return () => {
    if (localOwner()?.id !== owner || localEngine() !== engine) throw accountChanged()
  }
}

/** The static name a query key starts with, safe to send as an event property. */
export const queryEventName = ([name]: readonly unknown[]) =>
  typeof name === 'string' && /^[a-z][a-z-]{0,39}$/.test(name) ? name : 'other'

/** Reads that answered online with the copy saved on this device, by key hash, with the attempts to refresh each since. */
const savedCopies = new Map<string, { attempts: number; retry: ReturnType<typeof setTimeout> }>()
const savedCopyListeners = new Set<() => void>()
const subscribeSavedCopies = (listener: () => void) => {
  savedCopyListeners.add(listener)
  return () => void savedCopyListeners.delete(listener)
}

/** A failed online read shown from its saved copy is counted once, marked for its screen, and refreshed with backoff until one succeeds. */
function showSavedCopy(key: readonly unknown[], error: unknown) {
  if (typeof window === 'undefined') return
  const hash = hashKey(key)
  const shown = savedCopies.get(hash)
  if (shown) clearTimeout(shown.retry)
  else posthog.capture('saved_copy_shown', { query: queryEventName(key), reason: isFetchNetworkFailure(error) ? 'network' : 'error' })
  const attempts = (shown?.attempts ?? -1) + 1
  const retry = setTimeout(
    () => void localClient()?.invalidateQueries({ queryKey: key, exact: true }),
    Math.min(300_000, 15_000 * 2 ** attempts),
  )
  savedCopies.set(hash, { attempts, retry })
  if (!shown) for (const listener of savedCopyListeners) listener()
}

function clearSavedCopy(key: readonly unknown[]) {
  const hash = hashKey(key)
  const shown = savedCopies.get(hash)
  if (!shown) return
  clearTimeout(shown.retry)
  savedCopies.delete(hash)
  for (const listener of savedCopyListeners) listener()
}

/** Whether the screen for `key` shows the copy saved on this device because the service did not answer while online. */
export const isSavedCopy = (key: readonly unknown[]) => savedCopies.has(hashKey(key))

export const useSavedCopy = (key: readonly unknown[]) =>
  useSyncExternalStore(
    subscribeSavedCopies,
    () => isSavedCopy(key),
    () => false,
  )

export const isOffline = () => typeof window !== 'undefined' && typeof navigator.onLine === 'boolean' && !navigator.onLine

export async function cachedRead<T>(
  key: readonly unknown[],
  online: () => Promise<T>,
  options: { updateCache?: boolean } = {},
): Promise<T> {
  const client = localClient()
  const cached = client?.getQueryData<T>(key)
  if (typeof window === 'undefined') return online()
  if (isOffline()) {
    if (cached !== undefined) return cached
    throw new OfflineRefusal('This screen has not been saved on this device. Reconnect to load it.')
  }
  const owner = localOwner()?.id
  try {
    const data = await online()
    if (key[0] !== 'me' && localOwner()?.id !== owner) throw accountChanged()
    if (key[0] !== 'me' && options.updateCache !== false) client?.setQueryData(key, data)
    clearSavedCopy(key)
    return data
  } catch (error) {
    if (cached === undefined || localOwner()?.id !== owner) throw error
    showSavedCopy(key, error)
    return cached
  }
}

export async function cachedPage<T>(key: readonly unknown[], cursor: unknown, online: () => Promise<T>): Promise<T> {
  const cached = localClient()?.getQueryData<{ pages: T[]; pageParams: unknown[] }>(key)
  const index = cached?.pageParams.findIndex((value) => JSON.stringify(value ?? null) === JSON.stringify(cursor ?? null)) ?? -1
  const page = index >= 0 ? cached?.pages[index] : undefined
  if (isOffline()) {
    if (page !== undefined) return page
    throw new OfflineRefusal('This page has not been downloaded yet.')
  }
  const owner = localOwner()?.id
  try {
    const data = await online()
    if (localOwner()?.id !== owner) throw accountChanged()
    // A refresh reads the first page before the rest, so only its success clears the mark an older page may set.
    if (cursor == null) clearSavedCopy(key)
    return data
  } catch (error) {
    if (page === undefined || localOwner()?.id !== owner) throw error
    showSavedCopy(key, error)
    return page
  }
}

/** Offline, a filter reads the pages already saved for the whole feed; only the online search can reach further back. */
export async function filteredPage<T>(
  key: readonly unknown[],
  online: () => Promise<{ battles: T[]; nextCursor: unknown }>,
  matches: (battle: T, viewerId: string | null) => boolean,
  oldestFirst = false,
) {
  if (!isOffline()) return online()
  const cached = localClient()?.getQueryData<{ pages: { battles: T[] }[] }>(key)
  if (!cached) throw new OfflineRefusal('This page has not been downloaded yet.')
  const viewerId = localOwner()?.id ?? null
  const battles = cached.pages.flatMap((page) => page.battles).filter((battle) => matches(battle, viewerId))
  return { battles: oldestFirst ? battles.toReversed() : battles, nextCursor: null }
}

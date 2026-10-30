import { CancelledError } from '@tanstack/react-query'
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

export async function cachedRead<T>(
  key: readonly unknown[],
  online: () => Promise<T>,
  options: { updateCache?: boolean } = {},
): Promise<T> {
  const client = localClient()
  const cached = client?.getQueryData<T>(key)
  if (typeof window === 'undefined') return online()
  if (typeof navigator.onLine === 'boolean' && !navigator.onLine) {
    if (cached !== undefined) return cached
    throw new OfflineRefusal('This screen has not been saved on this device. Reconnect to load it.')
  }
  const owner = localOwner()?.id
  try {
    const data = await online()
    if (key[0] !== 'me' && localOwner()?.id !== owner) throw accountChanged()
    if (key[0] !== 'me' && options.updateCache !== false) client?.setQueryData(key, data)
    return data
  } catch (error) {
    if (cached !== undefined && localOwner()?.id === owner) return cached
    throw error
  }
}

export async function cachedPage<T>(key: readonly unknown[], cursor: unknown, online: () => Promise<T>): Promise<T> {
  const cached = localClient()?.getQueryData<{ pages: T[]; pageParams: unknown[] }>(key)
  const index = cached?.pageParams.findIndex((value) => JSON.stringify(value ?? null) === JSON.stringify(cursor ?? null)) ?? -1
  const page = index >= 0 ? cached?.pages[index] : undefined
  if (typeof window !== 'undefined' && typeof navigator.onLine === 'boolean' && !navigator.onLine) {
    if (page !== undefined) return page
    throw new OfflineRefusal('This page has not been downloaded yet.')
  }
  const owner = localOwner()?.id
  try {
    const data = await online()
    if (localOwner()?.id !== owner) throw accountChanged()
    return data
  } catch (error) {
    if (page !== undefined && localOwner()?.id === owner) return page
    throw error
  }
}

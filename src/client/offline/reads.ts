import { localClient, localOwner } from './localRuntime'

export async function cachedRead<T>(key: readonly unknown[], online: () => Promise<T>): Promise<T> {
  const client = localClient()
  const cached = client?.getQueryData<T>(key)
  if (typeof window === 'undefined') return online()
  if (typeof navigator.onLine === 'boolean' && !navigator.onLine) {
    if (cached !== undefined) return cached
    throw new Error('This screen has not been saved on this device. Reconnect to load it.')
  }
  const owner = localOwner()?.id
  try {
    const data = await online()
    if (key[0] !== 'me' && localOwner()?.id !== owner) throw new Error('The account changed while loading this screen.')
    if (key[0] !== 'me') client?.setQueryData(key, data)
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
    throw new Error('This page has not been downloaded yet.')
  }
  const owner = localOwner()?.id
  try {
    const data = await online()
    if (localOwner()?.id !== owner) throw new Error('The account changed while loading this page.')
    return data
  } catch (error) {
    if (page !== undefined && localOwner()?.id === owner) return page
    throw error
  }
}

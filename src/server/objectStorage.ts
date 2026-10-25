import { objectsIn, publicAssetsR2Client } from './r2Client'

export const DEFAULT_PUBLIC_ASSETS_BASE_URL = 'https://s3.praetorium.gg'

export type ObjectStore = {
  publicBaseUrl: string
  head: (key: string) => Promise<unknown>
  put: (key: string, body: Uint8Array, headers: Record<string, string>) => Promise<void>
}

export function publicAssetsBaseUrl(): string {
  return (process.env.PUBLIC_ASSETS_BASE_URL?.trim() || DEFAULT_PUBLIC_ASSETS_BASE_URL).replace(/\/$/, '')
}

export function configuredObjectStore(): ObjectStore | null {
  const objects = objectsIn(process.env, publicAssetsR2Client)
  return objects && { publicBaseUrl: publicAssetsBaseUrl(), head: objects.head, put: objects.put }
}

/** Uploads only when the key is not already there — every caller here writes content-addressed keys, so a hit means the bytes already match. */
export async function putIfAbsent(store: ObjectStore, key: string, body: Uint8Array, contentType: string) {
  if (!(await store.head(key)))
    await store.put(key, body, { 'content-type': contentType, 'cache-control': 'public, max-age=31536000, immutable' })
}

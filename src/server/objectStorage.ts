import { publicAssetsR2Client } from './r2Client'
import { localObjectStore } from './localObjectStore'

export const DEFAULT_PUBLIC_ASSETS_BASE_URL = 'https://assets.praetorium.gg'

type ObjectBucket = {
  head: (key: string) => Promise<unknown>
  put: (key: string, body: Uint8Array, options: { httpMetadata: { contentType: string; cacheControl: string } }) => Promise<unknown>
}
export type ObjectStore = { publicBaseUrl: string; bucket: ObjectBucket }

export function publicAssetsBaseUrl(): string {
  return (process.env.PUBLIC_ASSETS_BASE_URL?.trim() || DEFAULT_PUBLIC_ASSETS_BASE_URL).replace(/\/$/, '')
}

export function configuredObjectStore(): ObjectStore | null {
  if (process.env.PRAETORIUM_LOCAL_DEV === 'true') {
    if (!process.env.LOCAL_OBJECT_DIR) throw new Error('LOCAL_OBJECT_DIR is required for local development')
    return { bucket: localObjectStore(process.env.LOCAL_OBJECT_DIR), publicBaseUrl: publicAssetsBaseUrl() }
  }
  const r2 = publicAssetsR2Client()
  if (!r2) return null
  const { client, base } = r2
  return {
    publicBaseUrl: publicAssetsBaseUrl(),
    bucket: {
      async head(key) {
        const response = await client.fetch(`${base}${key}`, { method: 'HEAD', signal: AbortSignal.timeout(10_000) })
        if (response.status === 404) return null
        if (!response.ok) throw new Error(`R2 head failed with HTTP ${response.status}`)
        return { key }
      },
      async put(key, body, options) {
        const response = await client.fetch(`${base}${key}`, {
          method: 'PUT',
          body: new Uint8Array(body),
          headers: {
            'content-type': options.httpMetadata.contentType,
            'cache-control': options.httpMetadata.cacheControl,
          },
          signal: AbortSignal.timeout(30_000),
        })
        if (!response.ok) throw new Error(`R2 put failed with HTTP ${response.status}`)
        return null
      },
    },
  }
}

/** Uploads only when the key is not already there — every caller here writes content-addressed keys, so a hit means the bytes already match. */
export async function putIfAbsent(store: ObjectStore, key: string, body: Uint8Array, contentType: string) {
  if (!(await store.bucket.head(key))) {
    await store.bucket.put(key, body, { httpMetadata: { contentType, cacheControl: 'public, max-age=31536000, immutable' } })
  }
}

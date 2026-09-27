import { workerAppContext } from './workerAppContext'
import { r2Client } from './r2Client'
import { localObjectStore } from './localObjectStore'

/** Existing profile image and catalogue URLs remain stable across bucket key changes. */
export const DEFAULT_S3_PUBLIC_BASE_URL = 'https://s3.praetorium.gg/praetorium'

type ObjectBucket = {
  head: (key: string) => Promise<unknown>
  put: (key: string, body: Uint8Array, options: { httpMetadata: { contentType: string; cacheControl: string } }) => Promise<unknown>
}
export type ObjectStore = { publicBaseUrl: string; bucket: ObjectBucket }

/** Where a browser reads the bucket back from, configured or not: read access needs no credentials. */
export function s3PublicBaseUrl(): string {
  return (process.env.S3_PUBLIC_BASE_URL?.trim() || DEFAULT_S3_PUBLIC_BASE_URL).replace(/\/$/, '')
}

export function configuredObjectStore(): ObjectStore | null {
  const publicObjects = workerAppContext.getStore()?.publicObjects
  if (publicObjects) return { bucket: publicObjects, publicBaseUrl: s3PublicBaseUrl() }
  if (process.env.PRAETORIUM_LOCAL_DEV === 'true') {
    if (!process.env.LOCAL_OBJECT_DIR) throw new Error('LOCAL_OBJECT_DIR is required for local development')
    return { bucket: localObjectStore(process.env.LOCAL_OBJECT_DIR), publicBaseUrl: s3PublicBaseUrl() }
  }
  const r2 = r2Client()
  if (!r2) return null
  const { client, base } = r2
  return {
    publicBaseUrl: s3PublicBaseUrl(),
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

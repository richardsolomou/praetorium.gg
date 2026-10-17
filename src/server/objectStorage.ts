import { publicAssetsR2Client, r2Objects } from './r2Client'
import { localDevelopmentObjectStore } from './localObjectStore'

export const DEFAULT_PUBLIC_ASSETS_BASE_URL = 'https://s3.praetorium.gg'

type ObjectBucket = {
  head: (key: string) => Promise<unknown>
  put: (key: string, body: Uint8Array, options: { httpMetadata: { contentType: string; cacheControl: string } }) => Promise<unknown>
}
export type ObjectStore = { publicBaseUrl: string; bucket: ObjectBucket }

export function publicAssetsBaseUrl(): string {
  return (process.env.PUBLIC_ASSETS_BASE_URL?.trim() || DEFAULT_PUBLIC_ASSETS_BASE_URL).replace(/\/$/, '')
}

export function configuredObjectStore(): ObjectStore | null {
  const local = localDevelopmentObjectStore()
  if (local) return { bucket: local, publicBaseUrl: publicAssetsBaseUrl() }
  const r2 = publicAssetsR2Client()
  if (!r2) return null
  const objects = r2Objects(r2)
  return {
    publicBaseUrl: publicAssetsBaseUrl(),
    bucket: {
      head: async (key) => ((await objects.head(key)) ? { key } : null),
      async put(key, body, options) {
        await objects.put(key, body, {
          'content-type': options.httpMetadata.contentType,
          'cache-control': options.httpMetadata.cacheControl,
        })
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

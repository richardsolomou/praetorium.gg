import type { R2Bucket } from '@cloudflare/workers-types'
import { workerAppContext } from './workerAppContext'

/** Existing profile image and catalogue URLs remain stable across bucket key changes. */
export const DEFAULT_S3_PUBLIC_BASE_URL = 'https://s3.praetorium.gg/praetorium'

export type ObjectStore = { publicBaseUrl: string; bucket: R2Bucket }

/** Where a browser reads the bucket back from, configured or not: read access needs no credentials. */
export function s3PublicBaseUrl(): string {
  return (process.env.S3_PUBLIC_BASE_URL?.trim() || DEFAULT_S3_PUBLIC_BASE_URL).replace(/\/$/, '')
}

/** Null when the Worker has no object storage binding. */
export function configuredObjectStore(): ObjectStore | null {
  const publicObjects = workerAppContext.getStore()?.publicObjects
  return publicObjects ? { bucket: publicObjects, publicBaseUrl: s3PublicBaseUrl() } : null
}

/** Uploads only when the key is not already there — every caller here writes content-addressed keys, so a hit means the bytes already match. */
export async function putIfAbsent(store: ObjectStore, key: string, body: Uint8Array, contentType: string) {
  if (!(await store.bucket.head(key))) {
    await store.bucket.put(key, body, { httpMetadata: { contentType, cacheControl: 'public, max-age=31536000, immutable' } })
  }
}

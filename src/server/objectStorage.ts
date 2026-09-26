import { HeadObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3'
import type { R2Bucket } from '@cloudflare/workers-types'
import { workerAppContext } from './workerAppContext'

/** Existing profile image and catalogue URLs keep this base after storage moves to R2. */
export const DEFAULT_S3_PUBLIC_BASE_URL = 'https://s3.praetorium.gg/praetorium'

export type ObjectStore = { publicBaseUrl: string } & ({ kind: 'r2'; bucket: R2Bucket } | { kind: 's3'; bucket: string; client: S3Client })

/** Where a browser reads the bucket back from, configured or not: read access needs no credentials. */
export function s3PublicBaseUrl(): string {
  return (process.env.S3_PUBLIC_BASE_URL?.trim() || DEFAULT_S3_PUBLIC_BASE_URL).replace(/\/$/, '')
}

/** Null when the instance has not configured object storage — the feature it backs stays off rather than guessing. */
export function configuredObjectStore(): ObjectStore | null {
  const publicObjects = workerAppContext.getStore()?.publicObjects
  if (publicObjects) return { kind: 'r2', bucket: publicObjects, publicBaseUrl: DEFAULT_S3_PUBLIC_BASE_URL }
  const endpoint = process.env.S3_ENDPOINT?.trim()
  const bucket = process.env.S3_BUCKET?.trim()
  const accessKeyId = process.env.S3_ACCESS_KEY_ID?.trim()
  const secretAccessKey = process.env.S3_SECRET_ACCESS_KEY?.trim()
  if (!endpoint || !bucket || !accessKeyId || !secretAccessKey) return null
  const publicBaseUrl = s3PublicBaseUrl()
  const client = new S3Client({
    endpoint,
    region: process.env.S3_REGION?.trim() || 'us-east-1',
    forcePathStyle: true,
    credentials: { accessKeyId, secretAccessKey },
  })
  return { kind: 's3', bucket, publicBaseUrl, client }
}

/** Uploads only when the key is not already there — every caller here writes content-addressed keys, so a hit means the bytes already match. */
export async function putIfAbsent(store: ObjectStore, key: string, body: Uint8Array, contentType: string) {
  if (store.kind === 'r2') {
    const objectKey = `praetorium/${key}`
    if (!(await store.bucket.head(objectKey))) {
      await store.bucket.put(objectKey, body, { httpMetadata: { contentType, cacheControl: 'public, max-age=31536000, immutable' } })
    }
    return
  }
  try {
    await store.client.send(new HeadObjectCommand({ Bucket: store.bucket, Key: key }))
    return
  } catch {
    // Not found, or a transient error the put below will surface for real.
  }
  await store.client.send(
    new PutObjectCommand({
      Bucket: store.bucket,
      Key: key,
      Body: body,
      ContentType: contentType,
      CacheControl: 'public, max-age=31536000, immutable',
    }),
  )
}

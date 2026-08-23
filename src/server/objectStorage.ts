import { HeadObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3'

/** The shared public store; operators may override it with their own mirror or bucket. */
export const DEFAULT_S3_PUBLIC_BASE_URL = 'https://s3.praetorium.gg/praetorium'

export type ObjectStore = { bucket: string; publicBaseUrl: string; client: S3Client }

/** Where a browser reads the bucket back from, configured or not: read access needs no credentials. */
export function s3PublicBaseUrl(): string {
  return (process.env.S3_PUBLIC_BASE_URL?.trim() || DEFAULT_S3_PUBLIC_BASE_URL).replace(/\/$/, '')
}

/** Null when the instance has not configured object storage — the feature it backs stays off rather than guessing. */
export function configuredObjectStore(): ObjectStore | null {
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
  return { bucket, publicBaseUrl, client }
}

/** Uploads only when the key is not already there — every caller here writes content-addressed keys, so a hit means the bytes already match. */
export async function putIfAbsent(store: ObjectStore, key: string, body: Uint8Array, contentType: string) {
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

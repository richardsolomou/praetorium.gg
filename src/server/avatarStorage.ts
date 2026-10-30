import { hash } from 'node:crypto'
import { PROFILE_IMAGE_MAX_LENGTH } from '../authConfig'
import { configuredObjectStore, type ObjectStore, publicAssetsBaseUrl, putIfAbsent } from './objectStorage'
import { boundedBytes } from './boundedBody'
import { parseImageDataUrl, sniffedImageType } from './privateImages'

const CONTENT_TYPE_EXTENSION: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' }
const FETCHED_IMAGE_MAX_BYTES = 5_000_000

/**
 * True for a URL this module produced itself — an unmodified save re-sends `user.image`
 * unchanged, and that must pass straight through rather than being mistaken for a new upload
 * (it isn't a data URL) or accepted verbatim (an attacker's own `<img>` source, arbitrary and
 * unbounded, is exactly what storing an upload's own short URL instead of its bytes was for).
 */
export function isStoredProfileImageUrl(url: string): boolean {
  return [publicAssetsBaseUrl(), 'https://s3.praetorium.gg/praetorium'].some((base) => {
    const prefix = `${base}/avatars/`
    return url.startsWith(prefix) && /^[0-9a-f]{64}\.(?:jpg|png|webp)$/.test(url.slice(prefix.length))
  })
}

/**
 * Moves an uploaded picture into object storage and returns a short URL in its place.
 * `user.image` — and, from there, every session cookie that mirrors it — must stay small: a
 * data URL sent once in a request body is fine, but embedded in `user.image` it rides along on
 * every later request too, and is what overflows request headers once it's cookie-cached.
 */
export async function storeProfileImage(dataUrl: string): Promise<string> {
  if (dataUrl.length > PROFILE_IMAGE_MAX_LENGTH) throw new Error('Choose a JPEG, PNG or WebP profile picture.')
  const image = parseImageDataUrl(dataUrl)
  if (!image) throw new Error('Choose a JPEG, PNG or WebP profile picture.')
  const store = configuredObjectStore()
  if (!store) throw new Error('Profile picture uploads are not available.')
  return storeAvatarBytes(store, image.bytes, CONTENT_TYPE_EXTENSION[image.contentType] as string, image.contentType)
}

/**
 * Downloads a picture from an external URL — a social provider's avatar — and re-hosts it the
 * same way an upload is stored, so `user.image` never holds a link outside our own object store.
 * Returns null instead of throwing: a broken or slow avatar fetch must not block sign-up or linking.
 */
export async function storeProfileImageFromUrl(url: string): Promise<string | null> {
  const store = configuredObjectStore()
  if (!store) return null
  let bytes: Buffer
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(5000) })
    if (!response.ok) return null
    bytes = await boundedBytes(response, FETCHED_IMAGE_MAX_BYTES, 'profile picture too large')
  } catch {
    return null
  }
  const contentType = sniffedImageType(bytes)
  if (!contentType) return null
  return storeAvatarBytes(store, bytes, CONTENT_TYPE_EXTENSION[contentType] as string, contentType)
}

async function storeAvatarBytes(store: ObjectStore, bytes: Buffer, extension: string, contentType: string): Promise<string> {
  const key = `avatars/${hash('sha256', bytes)}.${extension}`
  await putIfAbsent(store, key, bytes, contentType)
  return `${store.publicBaseUrl}/${key}`
}

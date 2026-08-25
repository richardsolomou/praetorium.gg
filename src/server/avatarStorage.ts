import { createHash } from 'node:crypto'
import { PROFILE_IMAGE_MAX_LENGTH } from '../authConfig'
import { configuredObjectStore, type ObjectStore, putIfAbsent, s3PublicBaseUrl } from './objectStorage'

const DATA_URL = /^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/]+={0,2})$/
const EXTENSION: Record<string, string> = { jpeg: 'jpg', png: 'png', webp: 'webp' }
const CONTENT_TYPE_EXTENSION: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' }
const FETCHED_IMAGE_MAX_BYTES = 5_000_000

/**
 * True for a URL this module produced itself — an unmodified save re-sends `user.image`
 * unchanged, and that must pass straight through rather than being mistaken for a new upload
 * (it isn't a data URL) or accepted verbatim (an attacker's own `<img>` source, arbitrary and
 * unbounded, is exactly what storing an upload's own short URL instead of its bytes was for).
 */
export function isStoredProfileImageUrl(url: string): boolean {
  const prefix = `${s3PublicBaseUrl()}/avatars/`
  return url.startsWith(prefix) && /^[0-9a-f]{64}\.(?:jpg|png|webp)$/.test(url.slice(prefix.length))
}

/**
 * Moves an uploaded picture into object storage and returns a short URL in its place.
 * `user.image` — and, from there, every session cookie that mirrors it — must stay small: a
 * data URL sent once in a request body is fine, but embedded in `user.image` it rides along on
 * every later request too, and is what overflows request headers once it's cookie-cached.
 */
export async function storeProfileImage(dataUrl: string): Promise<string> {
  if (dataUrl.length > PROFILE_IMAGE_MAX_LENGTH) throw new Error('Choose a JPEG, PNG or WebP profile picture.')
  const match = DATA_URL.exec(dataUrl)
  if (!match) throw new Error('Choose a JPEG, PNG or WebP profile picture.')
  const [, format, base64] = match as unknown as [string, string, string]
  const store = configuredObjectStore()
  if (!store) throw new Error('This instance is not set up to store profile pictures.')
  return storeAvatarBytes(store, Buffer.from(base64, 'base64'), EXTENSION[format] as string, `image/${format}`)
}

/**
 * Downloads a picture from an external URL — a social provider's avatar — and re-hosts it the
 * same way an upload is stored, so `user.image` never holds a link outside our own object store.
 * Returns null instead of throwing: a broken or slow avatar fetch must not block sign-up or linking.
 */
export async function storeProfileImageFromUrl(url: string): Promise<string | null> {
  const store = configuredObjectStore()
  if (!store) return null
  let response: Response
  try {
    response = await fetch(url, { signal: AbortSignal.timeout(5000) })
  } catch {
    return null
  }
  if (!response.ok) return null
  const contentType = response.headers.get('content-type')?.split(';')[0]?.trim().toLowerCase()
  const extension = contentType ? CONTENT_TYPE_EXTENSION[contentType] : undefined
  if (!extension) return null
  const bytes = Buffer.from(await response.arrayBuffer())
  if (bytes.byteLength === 0 || bytes.byteLength > FETCHED_IMAGE_MAX_BYTES) return null
  return storeAvatarBytes(store, bytes, extension, contentType as string)
}

async function storeAvatarBytes(store: ObjectStore, bytes: Buffer, extension: string, contentType: string): Promise<string> {
  const key = `avatars/${createHash('sha256').update(bytes).digest('hex')}.${extension}`
  await putIfAbsent(store, key, bytes, contentType)
  return `${store.publicBaseUrl}/${key}`
}

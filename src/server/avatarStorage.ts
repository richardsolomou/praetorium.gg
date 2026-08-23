import { createHash } from 'node:crypto'
import { PROFILE_IMAGE_MAX_LENGTH } from '../authConfig'
import { configuredObjectStore, putIfAbsent, s3PublicBaseUrl } from './objectStorage'

const DATA_URL = /^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/]+={0,2})$/
const EXTENSION: Record<string, string> = { jpeg: 'jpg', png: 'png', webp: 'webp' }

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
  const bytes = Buffer.from(base64, 'base64')
  const key = `avatars/${createHash('sha256').update(bytes).digest('hex')}.${EXTENSION[format]}`
  await putIfAbsent(store, key, bytes, `image/${format}`)
  return `${store.publicBaseUrl}/${key}`
}

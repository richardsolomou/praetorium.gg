import { randomUUID } from 'node:crypto'
import { notFound } from './notFound'
import { objectsIn, privateR2Client } from './r2Client'

const DATA_URL = /^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/]+={0,2})$/
const FORMATS = {
  png: { contentType: 'image/png', matches: (bytes: Buffer) => bytes.subarray(0, 4).toString('hex') === '89504e47' },
  jpeg: { contentType: 'image/jpeg', matches: (bytes: Buffer) => bytes.subarray(0, 3).toString('hex') === 'ffd8ff' },
  webp: {
    contentType: 'image/webp',
    matches: (bytes: Buffer) => bytes.subarray(0, 4).toString('latin1') === 'RIFF' && bytes.subarray(8, 12).toString('latin1') === 'WEBP',
  },
}

type ImageFormat = keyof typeof FORMATS

/** An image data URL's bytes, when they match its declared format and that format is one of `formats`; otherwise null. */
export function parseImageDataUrl(image: string, formats: readonly ImageFormat[] = ['png', 'jpeg', 'webp']) {
  const match = DATA_URL.exec(image)
  const format = match?.[1] as ImageFormat | undefined
  if (!match || !format || !formats.includes(format)) return null
  const bytes = Buffer.from(match[2]!, 'base64')
  return FORMATS[format].matches(bytes) ? { format, contentType: FORMATS[format].contentType, bytes } : null
}

export type PrivateObjects = {
  head: (key: string) => Promise<boolean>
  put: (key: string, body: Uint8Array, contentType: string) => Promise<void>
  get: (key: string) => Promise<Uint8Array | null>
  /** Succeeds when the object is already gone, so a repeated deletion is harmless. */
  delete: (key: string) => Promise<void>
}

/**
 * The private bucket, which is never served publicly; null where it is not configured, as in previews.
 * Local stacks keep objects on disk, where only allowlisted public keys are served.
 */
export function privateObjects(environment: NodeJS.ProcessEnv = process.env): PrivateObjects | null {
  const objects = objectsIn(environment, privateR2Client)
  return objects && { ...objects, put: (key, body, contentType) => objects.put(key, body, { 'content-type': contentType }) }
}

/** Stores an uploaded image under `prefix` and a random id after checking its bytes match its declared type; returns the id. */
export async function storePrivateImage(
  objects: PrivateObjects | null,
  prefix: string,
  image: string,
  { maxBytes, refusal }: { maxBytes: number; refusal: string },
): Promise<string> {
  if (!objects) throw new Response('image uploads are not available', { status: 503 })
  const parsed = parseImageDataUrl(image)
  if (!parsed || parsed.bytes.byteLength > maxBytes) throw new Response(refusal, { status: 400 })
  const id = randomUUID()
  await objects.put(`${prefix}${id}`, parsed.bytes, parsed.contentType)
  return id
}

/** Serves a stored image with the type its bytes were checked against on upload, never cached because access can be revoked. */
export async function privateImageResponse(objects: PrivateObjects | null, key: string) {
  if (!objects) return new Response('image storage is not available', { status: 503, headers: { 'Cache-Control': 'no-store' } })
  const stored = await objects.get(key)
  const bytes = stored && Buffer.from(stored)
  const format = bytes && Object.values(FORMATS).find((candidate) => candidate.matches(bytes))
  if (!bytes || !format) return notFound()
  return new Response(new Uint8Array(bytes), {
    headers: {
      'Content-Type': format.contentType,
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  })
}

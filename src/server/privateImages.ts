import { randomUUID } from 'node:crypto'
import { localObjectStore } from './localObjectStore'
import { privateR2Client } from './r2Client'

const DATA_URL = /^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/]+={0,2})$/
const FORMATS = {
  png: { contentType: 'image/png', matches: (bytes: Buffer) => bytes.subarray(0, 4).toString('hex') === '89504e47' },
  jpeg: { contentType: 'image/jpeg', matches: (bytes: Buffer) => bytes.subarray(0, 3).toString('hex') === 'ffd8ff' },
  webp: {
    contentType: 'image/webp',
    matches: (bytes: Buffer) => bytes.subarray(0, 4).toString('latin1') === 'RIFF' && bytes.subarray(8, 12).toString('latin1') === 'WEBP',
  },
}

export type PrivateObjects = {
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
  if (environment.PRAETORIUM_LOCAL_DEV === 'true') {
    if (!environment.LOCAL_OBJECT_DIR) throw new Error('LOCAL_OBJECT_DIR is required for local development')
    const local = localObjectStore(environment.LOCAL_OBJECT_DIR)
    return {
      put: (key, body) => local.put(key, body),
      get: async (key) => {
        const object = await local.get(key)
        return object && new Uint8Array(await new Response(object.body).arrayBuffer())
      },
      delete: (key) => local.delete(key),
    }
  }
  const r2 = privateR2Client(environment)
  if (!r2) return null
  const { client, base } = r2
  return {
    async put(key, body, contentType) {
      const response = await client.fetch(`${base}${key}`, {
        method: 'PUT',
        body: new Uint8Array(body),
        headers: { 'content-type': contentType },
        signal: AbortSignal.timeout(30_000),
      })
      if (!response.ok) throw new Error(`R2 put failed with HTTP ${response.status}`)
    },
    async get(key) {
      const response = await client.fetch(`${base}${key}`, { signal: AbortSignal.timeout(30_000) })
      if (response.status === 404) return null
      if (!response.ok) throw new Error(`R2 get failed with HTTP ${response.status}`)
      return new Uint8Array(await response.arrayBuffer())
    },
    async delete(key) {
      const response = await client.fetch(`${base}${key}`, { method: 'DELETE', signal: AbortSignal.timeout(30_000) })
      if (!response.ok && response.status !== 404) throw new Error(`R2 delete failed with HTTP ${response.status}`)
    },
  }
}

/** Stores an uploaded image under `prefix` and a random id after checking its bytes match its declared type; returns the id. */
export async function storePrivateImage(
  objects: PrivateObjects | null,
  prefix: string,
  image: string,
  { maxBytes, refusal }: { maxBytes: number; refusal: string },
): Promise<string> {
  if (!objects) throw new Response('image uploads are not available', { status: 503 })
  const match = DATA_URL.exec(image)
  const format = match && FORMATS[match[1] as keyof typeof FORMATS]
  const bytes = match ? Buffer.from(match[2]!, 'base64') : null
  if (!format || !bytes || bytes.byteLength > maxBytes || !format.matches(bytes)) throw new Response(refusal, { status: 400 })
  const id = randomUUID()
  await objects.put(`${prefix}${id}`, bytes, format.contentType)
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

export const notFound = () => new Response('not found', { status: 404, headers: { 'Cache-Control': 'no-store' } })

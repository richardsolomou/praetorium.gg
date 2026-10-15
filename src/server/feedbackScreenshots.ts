import { randomUUID } from 'node:crypto'
import { FEEDBACK_SCREENSHOT_ID, FEEDBACK_SCREENSHOT_MAX_BYTES } from '../contracts/feedback'
import { localObjectStore } from './localObjectStore'
import { privateR2Client } from './r2Client'

const PREFIX = 'feedback/'
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
  }
}

/** Stores a screenshot under a random id and returns that id. */
export async function storeFeedbackScreenshot(dataUrl: string, objects = privateObjects()): Promise<string> {
  if (!objects) throw new Response('screenshot uploads are not available', { status: 503 })
  const match = DATA_URL.exec(dataUrl)
  const format = match && FORMATS[match[1] as keyof typeof FORMATS]
  const bytes = match ? Buffer.from(match[2]!, 'base64') : null
  if (!format || !bytes || bytes.byteLength > FEEDBACK_SCREENSHOT_MAX_BYTES || !format.matches(bytes))
    throw new Response('attach a PNG, JPEG or WebP screenshot under 5 MB', { status: 400 })
  const id = randomUUID()
  await objects.put(`${PREFIX}${id}`, bytes, format.contentType)
  return id
}

/** Serves a stored screenshot with the type its bytes were checked against on upload. */
export async function feedbackScreenshotResponse(id: string, objects = privateObjects()) {
  if (!FEEDBACK_SCREENSHOT_ID.test(id)) return new Response('not found', { status: 404 })
  if (!objects) return new Response('screenshot storage is not available', { status: 503 })
  const stored = await objects.get(`${PREFIX}${id}`)
  const bytes = stored && Buffer.from(stored)
  const format = bytes && Object.values(FORMATS).find((candidate) => candidate.matches(bytes))
  if (!bytes || !format) return new Response('not found', { status: 404 })
  return new Response(new Uint8Array(bytes), {
    headers: {
      'Content-Type': format.contentType,
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  })
}

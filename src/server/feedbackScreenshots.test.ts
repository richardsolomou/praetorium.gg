import { describe, expect, it } from 'vitest'
import { FEEDBACK_SCREENSHOT_ID, FEEDBACK_SCREENSHOT_MAX_BYTES } from '../contracts/feedback'
import { feedbackScreenshotResponse, storeFeedbackScreenshot, type PrivateObjects } from './feedbackScreenshots'

const PNG = Buffer.from('89504e470d0a1a0a0000000d49484452', 'hex')

function memoryObjects() {
  const stored = new Map<string, { body: Uint8Array; contentType: string }>()
  const objects: PrivateObjects = {
    put: async (key, body, contentType) => void stored.set(key, { body, contentType }),
    get: async (key) => {
      const object = stored.get(key)
      return object?.body ?? null
    },
  }
  return { stored, objects }
}

const dataUrl = (type: string, bytes: Buffer) => `data:${type};base64,${bytes.toString('base64')}`

async function status(promise: Promise<unknown>) {
  try {
    await promise
  } catch (error) {
    if (error instanceof Response) return error.status
    throw error
  }
  return 'stored'
}

describe('storeFeedbackScreenshot', () => {
  it('stores a PNG under the private feedback prefix with a random id', async () => {
    const { stored, objects } = memoryObjects()
    const id = await storeFeedbackScreenshot(dataUrl('image/png', PNG), objects)
    expect([FEEDBACK_SCREENSHOT_ID.test(id), [...stored.keys()], stored.get(`feedback/${id}`)?.contentType]).toEqual([
      true,
      [`feedback/${id}`],
      'image/png',
    ])
  })

  it('reports uploads as unavailable without private storage', async () => {
    expect(await status(storeFeedbackScreenshot(dataUrl('image/png', PNG), null))).toBe(503)
  })

  it('refuses a type other than PNG, JPEG or WebP', async () => {
    expect(await status(storeFeedbackScreenshot(dataUrl('image/svg+xml', PNG), memoryObjects().objects))).toBe(400)
  })

  it('refuses bytes that are not the declared image type', async () => {
    expect(await status(storeFeedbackScreenshot(dataUrl('image/jpeg', PNG), memoryObjects().objects))).toBe(400)
  })

  it('refuses an image over the size limit', async () => {
    const large = Buffer.concat([PNG, Buffer.alloc(FEEDBACK_SCREENSHOT_MAX_BYTES)])
    expect(await status(storeFeedbackScreenshot(dataUrl('image/png', large), memoryObjects().objects))).toBe(400)
  })
})

describe('feedbackScreenshotResponse', () => {
  it('returns a stored screenshot as an uncached image', async () => {
    const { objects } = memoryObjects()
    const id = await storeFeedbackScreenshot(dataUrl('image/png', PNG), objects)
    const response = await feedbackScreenshotResponse(id, objects)
    expect([response.status, response.headers.get('content-type'), response.headers.get('cache-control')]).toEqual([
      200,
      'image/png',
      'private, no-store',
    ])
  })

  it('does not read a key outside the feedback screenshots', async () => {
    const { objects } = memoryObjects()
    await objects.put('feedback/../backups/auth.zip', PNG, 'application/zip')
    expect((await feedbackScreenshotResponse('../backups/auth.zip', objects)).status).toBe(404)
  })

  it('reports a missing screenshot as not found', async () => {
    expect((await feedbackScreenshotResponse('0b7c6d1e-3f2a-4c5b-8d9e-0a1b2c3d4e5f', memoryObjects().objects)).status).toBe(404)
  })
})

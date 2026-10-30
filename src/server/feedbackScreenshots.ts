import { randomUUID } from 'node:crypto'
import { FEEDBACK_SCREENSHOT_ID, FEEDBACK_SCREENSHOT_MAX_BYTES } from '../contracts/feedback'
import { notFound } from './notFound'
import { parseImageDataUrl, privateImageResponse, privateObjects } from './privateImages'

const PREFIX = 'feedback/'

/** Stores a screenshot under a random id and returns that id. */
export async function storeFeedbackScreenshot(dataUrl: string, objects = privateObjects()): Promise<string> {
  if (!objects) throw new Response('image uploads are not available', { status: 503 })
  const parsed = parseImageDataUrl(dataUrl)
  if (!parsed || parsed.bytes.byteLength > FEEDBACK_SCREENSHOT_MAX_BYTES)
    throw new Response('attach a PNG, JPEG or WebP screenshot under 5 MB', { status: 400 })
  const id = randomUUID()
  await objects.put(`${PREFIX}${id}`, parsed.bytes, parsed.contentType)
  return id
}

export function feedbackScreenshotResponse(id: string, objects = privateObjects()) {
  if (!FEEDBACK_SCREENSHOT_ID.test(id)) return Promise.resolve(notFound())
  return privateImageResponse(objects, `${PREFIX}${id}`)
}

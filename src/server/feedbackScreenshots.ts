import { FEEDBACK_SCREENSHOT_ID, FEEDBACK_SCREENSHOT_MAX_BYTES } from '../contracts/feedback'
import { notFound } from './notFound'
import { privateImageResponse, privateObjects, storePrivateImage } from './privateImages'

const PREFIX = 'feedback/'

/** Stores a screenshot under a random id and returns that id. */
export function storeFeedbackScreenshot(dataUrl: string, objects = privateObjects()): Promise<string> {
  return storePrivateImage(objects, PREFIX, dataUrl, {
    maxBytes: FEEDBACK_SCREENSHOT_MAX_BYTES,
    refusal: 'attach a PNG, JPEG or WebP screenshot under 5 MB',
  })
}

export function feedbackScreenshotResponse(id: string, objects = privateObjects()) {
  if (!FEEDBACK_SCREENSHOT_ID.test(id)) return Promise.resolve(notFound())
  return privateImageResponse(objects, `${PREFIX}${id}`)
}

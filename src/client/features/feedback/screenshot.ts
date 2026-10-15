import { FEEDBACK_SCREENSHOT_MAX_BYTES } from '../../../contracts/feedback'
import { canvasBlob, dataUrl } from '../../imageFile'

const INPUT_MAX_BYTES = 25_000_000
const LONGEST_EDGES = [1920, 1280]
const QUALITIES = [0.82, 0.65]

/** Downscales and re-encodes a screenshot, which also drops any metadata the original carried. */
export async function prepareFeedbackScreenshot(file: Blob): Promise<string> {
  if (!file.type.startsWith('image/') || file.size > INPUT_MAX_BYTES) throw new Error('Attach an image smaller than 25 MB.')

  let source: ImageBitmap
  try {
    source = await createImageBitmap(file)
  } catch {
    throw new Error('That image could not be read. Attach a PNG, JPEG or WebP screenshot.')
  }

  try {
    const canvas = document.createElement('canvas')
    const context = canvas.getContext('2d')
    if (!context) throw new Error('This browser cannot prepare the screenshot.')

    let type = 'image/webp'
    for (const edge of LONGEST_EDGES) {
      const scale = Math.min(1, edge / Math.max(source.width, source.height))
      canvas.width = Math.max(1, Math.round(source.width * scale))
      canvas.height = Math.max(1, Math.round(source.height * scale))
      context.drawImage(source, 0, 0, canvas.width, canvas.height)
      for (const quality of QUALITIES) {
        let blob = await canvasBlob(canvas, type, quality)
        if (type === 'image/webp' && blob.type !== type) {
          type = 'image/jpeg'
          blob = await canvasBlob(canvas, type, quality)
        }
        if (blob.size <= FEEDBACK_SCREENSHOT_MAX_BYTES) return await dataUrl(blob)
      }
    }
    throw new Error('That screenshot could not be made small enough.')
  } finally {
    source.close()
  }
}

import { FEEDBACK_SCREENSHOT_MAX_BYTES } from '../../../contracts/feedback'
import { shrinkImage } from '../../imageFile'

const INPUT_MAX_BYTES = 25_000_000

export async function prepareFeedbackScreenshot(file: Blob): Promise<string> {
  if (!file.type.startsWith('image/') || file.size > INPUT_MAX_BYTES) throw new Error('Attach an image smaller than 25 MB.')
  return shrinkImage(file, { edges: [1920, 1280], qualities: [0.82, 0.65], maxBytes: FEEDBACK_SCREENSHOT_MAX_BYTES, noun: 'screenshot' })
}

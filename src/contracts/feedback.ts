import { z } from 'zod'

export const FEEDBACK_SCREENSHOT_MAX_BYTES = 5_000_000

/** Base64 grows bytes by a third; the prefix is at most `data:image/jpeg;base64,`. */
const FEEDBACK_SCREENSHOT_MAX_LENGTH = Math.ceil(FEEDBACK_SCREENSHOT_MAX_BYTES / 3) * 4 + 32

export const feedbackScreenshotSchema = z.object({ image: z.string().max(FEEDBACK_SCREENSHOT_MAX_LENGTH) })

/** A stored screenshot's id: a random UUID, so one cannot be guessed from another. */
export const FEEDBACK_SCREENSHOT_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/

/** Where an administrator opens a stored screenshot. */
export const feedbackScreenshotPath = (id: string) => `/api/feedback-screenshots/${id}`

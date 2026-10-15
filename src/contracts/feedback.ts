import { z } from 'zod'

/** The App feedback survey's choices, in its order. */
export const FEEDBACK_KINDS = ['Problem', 'Idea', 'Other'] as const
export type FeedbackKind = (typeof FEEDBACK_KINDS)[number]

/** The SDK cuts any string property at 65,535 characters; the message is sent twice, well inside the 1 MB event limit. */
export const IMPORT_REPORT_MAX_LENGTH = 60_000

export const FEEDBACK_SCREENSHOT_MAX_BYTES = 5_000_000

/** Base64 grows bytes by a third; the prefix is at most `data:image/jpeg;base64,`. */
const FEEDBACK_SCREENSHOT_MAX_LENGTH = Math.ceil(FEEDBACK_SCREENSHOT_MAX_BYTES / 3) * 4 + 32

export const feedbackScreenshotSchema = z.object({ image: z.string().max(FEEDBACK_SCREENSHOT_MAX_LENGTH) })

/** A stored screenshot's id: a random UUID, so one cannot be guessed from another. */
export const FEEDBACK_SCREENSHOT_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/

/** Where an administrator opens a stored screenshot. */
export const feedbackScreenshotPath = (id: string) => `/api/feedback-screenshots/${id}`

const link = z.url({ protocol: /^https?$/ }).max(2000)

/** What the client knows about a sent feedback response; who sent it comes from the server's session. */
export const feedbackEmailSchema = z.object({
  kind: z.enum(FEEDBACK_KINDS),
  message: z.string().trim().min(1).max(IMPORT_REPORT_MAX_LENGTH),
  automatic: z.boolean(),
  replyEmail: z.email().max(254).optional(),
  pageUrl: link,
  screenshotId: z.string().regex(FEEDBACK_SCREENSHOT_ID).optional(),
  sessionId: z
    .string()
    .regex(/^[0-9A-Za-z-]{1,64}$/)
    .optional(),
})
export type FeedbackEmailInput = z.infer<typeof feedbackEmailSchema>

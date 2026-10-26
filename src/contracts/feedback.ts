import { z } from 'zod'
import { imageDataUrlMaxLength } from '../core/base64'

/** What a player says their feedback is, in the order the dialog offers. */
export const FEEDBACK_KINDS = ['Problem', 'Idea', 'Other'] as const
export type FeedbackKind = (typeof FEEDBACK_KINDS)[number]

const DETAILS = new RegExp(`\\n\\n(${FEEDBACK_KINDS.join('|')}) · Praetorium (\\S+)(\\nScreenshot: \\S+)?$`)

/** What the player wrote in an opening message, apart from the details `feedbackTicketMessage` appended. */
export function readTicketMessage(content: string): { body: string; kind?: FeedbackKind; version?: string; screenshot: boolean } {
  const details = DETAILS.exec(content)
  if (!details) return { body: content, screenshot: false }
  return { body: content.slice(0, details.index), kind: details[1] as FeedbackKind, version: details[2], screenshot: Boolean(details[3]) }
}

const SUBJECT_LENGTH = 72

/** The first line of what the player wrote, which names a conversation the way a subject line would. */
export function ticketSubject(content: string) {
  const line = readTicketMessage(content).body.trim().split('\n')[0]!.trim()
  return line.length > SUBJECT_LENGTH ? `${line.slice(0, SUBJECT_LENGTH - 1).trimEnd()}…` : line
}

/** A message on one line, with the team's markdown images and links read as words rather than syntax. */
export const messagePreview = (content: string) =>
  readTicketMessage(content)
    .body.replace(/!\[[^\]]*\]\([^)]*\)/g, 'Image')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\s+/g, ' ')
    .trim()

/** The SDK cuts any string property at 65,535 characters; the message is sent twice, well inside the 1 MB event limit. */
export const IMPORT_REPORT_MAX_LENGTH = 60_000

export const FEEDBACK_SCREENSHOT_MAX_BYTES = 5_000_000

export const feedbackScreenshotSchema = z.object({ image: z.string().max(imageDataUrlMaxLength(FEEDBACK_SCREENSHOT_MAX_BYTES)) })

/** A stored screenshot's id: a random UUID, so one cannot be guessed from another. */
export const FEEDBACK_SCREENSHOT_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/

/** Where an administrator opens a stored screenshot. */
export const feedbackScreenshotPath = (id: string) => `/api/feedback-screenshots/${id}`

const link = z.url({ protocol: /^https?$/ }).max(2000)

/** What the client knows about an automatic import report; who sent it comes from the server's session. */
export const feedbackEmailSchema = z.object({
  message: z.string().trim().min(1).max(IMPORT_REPORT_MAX_LENGTH),
  pageUrl: link,
  sessionId: z
    .string()
    .regex(/^[0-9A-Za-z-]{1,64}$/)
    .optional(),
})
export type FeedbackEmailInput = z.infer<typeof feedbackEmailSchema>

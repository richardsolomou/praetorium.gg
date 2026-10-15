import { version } from '../../package.json'
import { feedbackScreenshotPath, type FeedbackEmailInput } from '../contracts/feedback'

/** Comfortably inside what mail servers accept for one plain-text body. */
export const FEEDBACK_EMAIL_MAX_BYTES = 64 * 1024

const REPLAY_BASE = 'https://us.posthog.com/project/548119/replay/'

type Sender = { name: string; email: string } | null

/** The email administrators receive for one feedback response; the sender comes from the session, never the client. */
export function feedbackEmail(input: FeedbackEmailInput, sender: Sender, appUrl: string | undefined) {
  const from = sender
    ? `${sender.name} <${sender.email}> (signed in)`
    : input.replyEmail
      ? `Guest, reply to ${input.replyEmail}`
      : 'Guest, no reply email'
  const lines = [
    `Kind: ${input.automatic ? 'Automatic import failure report' : input.kind}`,
    `From: ${from}`,
    `Page: ${input.pageUrl}`,
    ...(input.screenshotId && appUrl ? [`Screenshot: ${new URL(feedbackScreenshotPath(input.screenshotId), appUrl).href}`] : []),
    ...(input.sessionId ? [`Replay: ${REPLAY_BASE}${input.sessionId}`] : []),
    `Version: ${version}`,
    '',
    input.message,
  ]
  const bytes = new TextEncoder().encode(lines.join('\n'))
  const text =
    bytes.byteLength > FEEDBACK_EMAIL_MAX_BYTES
      ? `${new TextDecoder().decode(bytes.subarray(0, FEEDBACK_EMAIL_MAX_BYTES - 64)).replace(/�$/, '')}\n[truncated]`
      : lines.join('\n')
  return { subject: input.automatic ? 'Praetorium import failure' : `Praetorium feedback: ${input.kind}`, text, html: textHtml(text) }
}

const HTML_ESCAPES: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }

/** Some mail clients reflow a plain-text body into one paragraph, so the HTML part keeps every line and links its URLs. */
function textHtml(text: string) {
  const escaped = text.replace(/[&<>"']/g, (character) => HTML_ESCAPES[character]!)
  const linked = escaped.replace(/https:\/\/[^\s<]+/g, (url) => `<a href="${url}">${url}</a>`)
  return `<div style="font-family:monospace">${linked.replaceAll('\n', '<br>')}</div>`
}

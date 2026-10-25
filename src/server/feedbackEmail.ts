import { version } from '../../package.json'
import type { FeedbackEmailInput } from '../contracts/feedback'
import { escapeHtml } from './escapeHtml'

/** Comfortably inside what mail servers accept for one plain-text body. */
export const FEEDBACK_EMAIL_MAX_BYTES = 64 * 1024

const REPLAY_BASE = 'https://us.posthog.com/project/548119/replay/'

type Sender = { name: string; email: string } | null

/** The email administrators receive for one automatic import report; the sender comes from the session, never the client. */
export function feedbackEmail(input: FeedbackEmailInput, sender: Sender) {
  const lines = [
    `From: ${sender ? `${sender.name} <${sender.email}> (signed in)` : 'Guest'}`,
    `Page: ${input.pageUrl}`,
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
  return { subject: 'Praetorium import failure', text, html: textHtml(text) }
}

/** Some mail clients reflow a plain-text body into one paragraph, so the HTML part keeps every line and links its URLs. */
function textHtml(text: string) {
  const escaped = escapeHtml(text)
  const linked = escaped.replace(/https:\/\/[^\s<]+/g, (url) => `<a href="${url}">${url}</a>`)
  return `<div style="font-family:monospace">${linked.replaceAll('\n', '<br>')}</div>`
}

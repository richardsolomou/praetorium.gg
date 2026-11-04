import { version } from '../../package.json'
import type { FeedbackEmailInput } from '../contracts/feedback'

/** Comfortably inside what mail servers accept for one plain-text body. */
export const FEEDBACK_EMAIL_MAX_BYTES = 64 * 1024

const REPLAY_BASE = 'https://us.posthog.com/project/548119/replay/'

type Sender = { name: string; email: string } | null

/** The email administrators receive for one automatic import report; the sender comes from the session, never the client. */
export function feedbackEmail(input: FeedbackEmailInput, sender: Sender) {
  const bytes = new TextEncoder().encode(input.message)
  const message =
    bytes.byteLength > FEEDBACK_EMAIL_MAX_BYTES
      ? `${new TextDecoder().decode(bytes.subarray(0, FEEDBACK_EMAIL_MAX_BYTES - 64)).replace(/�$/, '')}\n[truncated]`
      : input.message
  return {
    template: 'importFailure' as const,
    data: {
      sender: sender ? `${sender.name} <${sender.email}> (signed in)` : 'Guest',
      page_url: input.pageUrl,
      ...(input.sessionId ? { replay_url: `${REPLAY_BASE}${input.sessionId}` } : {}),
      version,
      message,
    },
  }
}

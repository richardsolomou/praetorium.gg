import { posthog } from 'posthog-js'
import type { FeedbackEmailInput } from '../../../contracts/feedback'
import { emailFeedback } from '../../functions'

/**
 * Captures an automatic import report, then asks the server to email it to the administrators. Capture is the
 * record; false means it was not taken, as when analytics is blocked.
 */
export function sendFeedback(
  response: { event: string; properties: Record<string, unknown> },
  email: Omit<FeedbackEmailInput, 'pageUrl' | 'sessionId'>,
) {
  if (!posthog.capture(response.event, response.properties, { send_instantly: true })) return false
  const sessionId = posthog.get_session_id()
  void emailFeedback({
    data: { ...email, pageUrl: `${window.location.origin}${window.location.pathname}`, ...(sessionId ? { sessionId } : {}) },
  }).catch(() => {
    // The server reports a failed delivery itself, and the response is already recorded.
  })
  return true
}

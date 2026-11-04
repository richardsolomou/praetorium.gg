import { describe, expect, it } from 'vitest'
import type { FeedbackEmailInput } from '../contracts/feedback'
import { FEEDBACK_EMAIL_MAX_BYTES, feedbackEmail } from './feedbackEmail'

const input: FeedbackEmailInput = {
  message: 'Automatic report: roster import failed',
  pageUrl: 'https://praetorium.gg/rosters/import',
}

describe('feedbackEmail', () => {
  it('identifies a signed-in sender from the session', () => {
    expect(feedbackEmail(input, { name: 'Ana', email: 'ana@example.com' }).data.sender).toBe('Ana <ana@example.com> (signed in)')
  })

  it('names a guest sender', () => {
    expect(feedbackEmail(input, null).data.sender).toBe('Guest')
  })

  it('links the replay', () => {
    expect(feedbackEmail({ ...input, sessionId: '019a-session' }, null).data.replay_url).toBe(
      'https://us.posthog.com/project/548119/replay/019a-session',
    )
  })

  it('leaves out the replay without a session, which the template would otherwise link as present', () => {
    expect(feedbackEmail(input, null).data).not.toHaveProperty('replay_url')
  })

  it('cuts a message over 64 KB', () => {
    const { message } = feedbackEmail({ ...input, message: 'é'.repeat(FEEDBACK_EMAIL_MAX_BYTES) }, null).data
    expect([new TextEncoder().encode(message).byteLength <= FEEDBACK_EMAIL_MAX_BYTES, message.endsWith('\n[truncated]')]).toEqual([
      true,
      true,
    ])
  })
})

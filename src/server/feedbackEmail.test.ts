import { describe, expect, it } from 'vitest'
import type { FeedbackEmailInput } from '../contracts/feedback'
import { FEEDBACK_EMAIL_MAX_BYTES, feedbackEmail } from './feedbackEmail'

const input: FeedbackEmailInput = {
  message: 'Automatic report: roster import failed',
  pageUrl: 'https://praetorium.gg/rosters/import',
}

describe('feedbackEmail', () => {
  it('names an import report in the subject', () => {
    expect(feedbackEmail(input, null).subject).toBe('Praetorium import failure')
  })

  it('identifies a signed-in sender from the session', () => {
    expect(feedbackEmail(input, { name: 'Ana', email: 'ana@example.com' }).text).toContain('From: Ana <ana@example.com> (signed in)')
  })

  it('names a guest sender', () => {
    expect(feedbackEmail(input, null).text).toContain('From: Guest\n')
  })

  it('links the replay', () => {
    expect(feedbackEmail({ ...input, sessionId: '019a-session' }, null).text).toContain(
      'Replay: https://us.posthog.com/project/548119/replay/019a-session',
    )
  })

  it('ends with the full message', () => {
    expect(feedbackEmail(input, null).text.endsWith('\n\nAutomatic report: roster import failed')).toBe(true)
  })

  it('cuts a body over 64 KB', () => {
    const { text } = feedbackEmail({ ...input, message: 'é'.repeat(FEEDBACK_EMAIL_MAX_BYTES) }, null)
    expect([new TextEncoder().encode(text).byteLength <= FEEDBACK_EMAIL_MAX_BYTES, text.endsWith('\n[truncated]')]).toEqual([true, true])
  })

  it('keeps every line and escapes markup in the HTML part', () => {
    const { html } = feedbackEmail({ ...input, message: '<b>two</b>\nlines' }, null)
    expect(html).toContain('&lt;b&gt;two&lt;/b&gt;<br>lines')
  })

  it('links the page address in the HTML part', () => {
    expect(feedbackEmail(input, null).html).toContain(`<a href="${input.pageUrl}">${input.pageUrl}</a>`)
  })
})

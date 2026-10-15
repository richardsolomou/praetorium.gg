import { describe, expect, it } from 'vitest'
import type { FeedbackEmailInput } from '../contracts/feedback'
import { FEEDBACK_EMAIL_MAX_BYTES, feedbackEmail } from './feedbackEmail'

const input: FeedbackEmailInput = {
  kind: 'Problem',
  message: 'The picker will not scroll',
  automatic: false,
  pageUrl: 'https://praetorium.gg/rosters/abc',
}

describe('feedbackEmail', () => {
  it('names the kind in the subject', () => {
    expect(feedbackEmail(input, null, 'https://praetorium.gg').subject).toBe('Praetorium feedback: Problem')
  })

  it('names an automatic import report in the subject', () => {
    expect(feedbackEmail({ ...input, automatic: true }, null, 'https://praetorium.gg').subject).toBe('Praetorium import failure')
  })

  it('identifies a signed-in sender from the session', () => {
    expect(feedbackEmail(input, { name: 'Ana', email: 'ana@example.com' }, undefined).text).toContain(
      'From: Ana <ana@example.com> (signed in)',
    )
  })

  it("gives a guest's reply email", () => {
    expect(feedbackEmail({ ...input, replyEmail: 'guest@example.com' }, null, undefined).text).toContain(
      'From: Guest, reply to guest@example.com',
    )
  })

  it('links the screenshot and replay', () => {
    const { text } = feedbackEmail(
      { ...input, screenshotId: '0b7c6d1e-3f2a-4c5b-8d9e-0a1b2c3d4e5f', sessionId: '019a-session' },
      null,
      'https://praetorium.gg',
    )
    expect(text.split('\n').filter((line) => /^(Screenshot|Replay):/.test(line))).toEqual([
      'Screenshot: https://praetorium.gg/api/feedback-screenshots/0b7c6d1e-3f2a-4c5b-8d9e-0a1b2c3d4e5f',
      'Replay: https://us.posthog.com/project/548119/replay/019a-session',
    ])
  })

  it('ends with the full message', () => {
    expect(feedbackEmail(input, null, undefined).text.endsWith('\n\nThe picker will not scroll')).toBe(true)
  })

  it('cuts a body over 64 KB', () => {
    const { text } = feedbackEmail({ ...input, message: 'é'.repeat(FEEDBACK_EMAIL_MAX_BYTES) }, null, undefined)
    expect([new TextEncoder().encode(text).byteLength <= FEEDBACK_EMAIL_MAX_BYTES, text.endsWith('\n[truncated]')]).toEqual([true, true])
  })

  it('keeps every line and links its addresses in the HTML part', () => {
    const { html } = feedbackEmail({ ...input, message: '<b>two</b>\nlines' }, null, 'https://praetorium.gg')
    expect(html).toContain('Kind: Problem<br>From: Guest, no reply email')
    expect(html).toContain('&lt;b&gt;two&lt;/b&gt;<br>lines')
  })

  it('links the page address in the HTML part', () => {
    expect(feedbackEmail(input, null, undefined).html).toContain(`<a href="${input.pageUrl}">${input.pageUrl}</a>`)
  })
})

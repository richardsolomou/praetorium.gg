import { describe, expect, it } from 'vitest'
import { publicSupportPayload, supportDraftSchema, supportPageForPath, supportSubmissionSchema } from './supportReport'
import { supportDraft as draft } from './supportReport.fixtures'

describe('public support reports', () => {
  it('publishes exactly the reviewed fields without account or object identifiers', () => {
    expect(publicSupportPayload(draft)).toEqual({
      title: '[bug] Roster save fails',
      body: 'Saving my army shows a connection error.\n\nReport reference: 00000000-0000-4000-8000-000000000001\nCategory: bug\nPage: rosters\nApp version: 0.116.0',
    })
  })
  it('includes the complete explicitly attached text in the public payload', () => {
    expect(publicSupportPayload({ ...draft, attachment: 'Reproduction steps here', rulesVersion: 'September update' }).body).toContain(
      'Rules version: September update\n\nText attachment:\nReproduction steps here',
    )
  })
  it.each([undefined, false])('refuses absent or declined publication consent (%s)', (publishPublicly) => {
    expect(supportSubmissionSchema.safeParse({ ...draft, publishPublicly }).success).toBe(false)
  })
  it.each(['email', 'userId', 'roster', 'screenshot'])('refuses unreviewed extra context: %s', (key) => {
    expect(supportDraftSchema.safeParse({ ...draft, [key]: 'private' }).success).toBe(false)
  })
  it.each(['description', 'attachment'])('bounds %s before any external request', (key) => {
    expect(supportDraftSchema.safeParse({ ...draft, [key]: 'a'.repeat(8_001) }).success).toBe(false)
  })
  it('refuses an opaque object URL as page context', () => {
    expect(supportDraftSchema.safeParse({ ...draft, page: '/battles/secret-token' }).success).toBe(false)
  })
  it('reduces a private battle URL to its page category', () => {
    expect(supportPageForPath('/battles/private-token?mission=secret')).toBe('battle')
  })
})

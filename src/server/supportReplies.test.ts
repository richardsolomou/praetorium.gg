import { describe, expect, it, vi } from 'vitest'
import { firstReplySincePlayer, supportReplyEmail, supportReplyResponse, type SupportReplyDeps } from './supportReplies'

const at = (minute: number) => new Date(Date.UTC(2026, 9, 24, 5, minute)).toISOString()
const player = (minute: number) => ({ author_type: 'customer', is_private: false, created_at: at(minute) })
const team = (minute: number, is_private = false) => ({ author_type: 'support', is_private, created_at: at(minute) })

describe('firstReplySincePlayer', () => {
  it('counts the first reply after the player wrote', () => {
    expect(firstReplySincePlayer([player(0), team(1)])).toBe(true)
  })

  it('stays quiet for a second reply before the player answers', () => {
    expect(firstReplySincePlayer([player(0), team(1), team(2)])).toBe(false)
  })

  it('counts our first reply again once the player has answered', () => {
    expect(firstReplySincePlayer([player(0), team(1), player(2), team(3)])).toBe(true)
  })

  it('leaves internal notes out, since the player never sees them', () => {
    expect(firstReplySincePlayer([player(0), team(1, true), team(2)])).toBe(true)
  })

  it('reads the thread in time order whatever order it arrives in', () => {
    expect(firstReplySincePlayer([team(3), player(2), team(1), player(0)])).toBe(true)
  })
})

describe('supportReplyEmail', () => {
  const url = 'https://praetorium.gg/support?conversation=t-1'

  it('says who replied to which message and links the conversation, keeping the reply itself out', () => {
    expect(supportReplyEmail({ name: 'Tronic', url, subject: 'The picker will not scroll', replier: 'Richard' }).text).toBe(
      'Hi Tronic,\n\nRichard replied to your message:\n"The picker will not scroll"\n\nView the reply: https://praetorium.gg/support?conversation=t-1\n\nYou\'re getting this because you contacted Praetorium. Replies to this email aren\'t read, so answer in Praetorium instead.',
    )
  })

  it('threads under the player’s own words', () => {
    expect(supportReplyEmail({ name: 'Tronic', url, subject: 'The picker will not scroll' }).subject).toBe('Re: The picker will not scroll')
  })

  it('falls back to a plain subject for a conversation without one', () => {
    expect(supportReplyEmail({ name: 'Tronic', url }).subject).toBe('New reply from Praetorium')
  })

  it('signs as Praetorium when the reply has no name', () => {
    expect(supportReplyEmail({ name: 'Tronic', url }).text).toContain('Praetorium replied to your message.')
  })

  it('points its button at the conversation', () => {
    expect(supportReplyEmail({ name: 'Tronic', url }).html).toMatch(
      /<a href="https:\/\/praetorium\.gg\/support\?conversation=t-1"[^>]*>View reply<\/a>/,
    )
  })

  it('escapes what the player wrote in the HTML part', () => {
    expect(supportReplyEmail({ name: 'Tronic', url, subject: '<b>bold</b>' }).html).toContain('&lt;b&gt;bold&lt;/b&gt;')
  })
})

describe('supportReplyResponse', () => {
  const post = (body: unknown, secret = 'webhook-secret') =>
    new Request('https://praetorium.gg/api/support-replies', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-praetorium-webhook-secret': secret },
      body: JSON.stringify(body),
    })
  const deps = (overrides: Partial<SupportReplyDeps> = {}): SupportReplyDeps => ({
    secret: 'webhook-secret',
    readTicket: async () => ({
      ticket: { distinct_id: 'user-1', anonymous_traits: { email: 'typed@example.com' } },
      messages: [player(0), team(1)],
    }),
    account: async (id) => (id === 'user-1' ? { name: 'Tronic', email: 'tronic@example.com' } : null),
    send: vi.fn(async () => undefined),
    appUrl: 'https://praetorium.gg',
    ...overrides,
  })

  it('emails the account that owns the conversation, linking straight to it', async () => {
    const send = vi.fn(async () => undefined)
    expect((await supportReplyResponse(post({ ticket_id: 't-1' }), deps({ send }))).status).toBe(204)
    expect(send).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        to: 'tronic@example.com',
        text: expect.stringContaining('https://praetorium.gg/support?conversation=t-1'),
      }),
    )
  })

  it('names the conversation by the player’s first line and the reply by its author’s first name', async () => {
    const send = vi.fn(async () => undefined)
    const readTicket: SupportReplyDeps['readTicket'] = async () => ({
      ticket: { distinct_id: 'user-1' },
      messages: [
        { ...player(0), content: 'Picker will not scroll\n\nProblem · Praetorium 0.188.0' },
        { ...team(1), author_name: 'Richard Solomou', content: 'Fixed, thanks!' },
      ],
    })
    await supportReplyResponse(post({ ticket_id: 't-1' }), deps({ send, readTicket }))
    expect(send).toHaveBeenCalledWith(
      expect.objectContaining({ subject: 'Re: Picker will not scroll', text: expect.stringContaining('Richard replied to your message:') }),
    )
  })

  it('emails a guest at the address they left', async () => {
    const send = vi.fn(async () => undefined)
    await supportReplyResponse(post({ ticket_id: 't-1' }), deps({ send, account: async () => null }))
    expect(send).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ to: 'typed@example.com' }))
  })

  it('sends nothing for a guest who left no address', async () => {
    const send = vi.fn(async () => undefined)
    const readTicket: SupportReplyDeps['readTicket'] = async () => ({ ticket: { distinct_id: 'anon' }, messages: [player(0), team(1)] })
    await supportReplyResponse(post({ ticket_id: 't-1' }), deps({ send, readTicket, account: async () => null }))
    expect(send).not.toHaveBeenCalled()
  })

  it('sends nothing for a later reply in the same run', async () => {
    const send = vi.fn(async () => undefined)
    const readTicket: SupportReplyDeps['readTicket'] = async () => ({
      ticket: { distinct_id: 'user-1' },
      messages: [player(0), team(1), team(2)],
    })
    await supportReplyResponse(post({ ticket_id: 't-1' }), deps({ send, readTicket }))
    expect(send).not.toHaveBeenCalled()
  })

  it('refuses a request without the webhook secret before reading anything', async () => {
    const readTicket = vi.fn()
    expect((await supportReplyResponse(post({ ticket_id: 't-1' }, 'guess'), deps({ readTicket }))).status).toBe(401)
    expect(readTicket).not.toHaveBeenCalled()
  })

  it('answers as a missing route where replies are not configured', async () => {
    expect((await supportReplyResponse(post({ ticket_id: 't-1' }), deps({ secret: undefined }))).status).toBe(404)
  })

  it('rejects a body without a ticket', async () => {
    expect((await supportReplyResponse(post({ ticket: 't-1' }), deps())).status).toBe(400)
  })
})

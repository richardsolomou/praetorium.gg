import { beforeEach, describe, expect, it, vi } from 'vitest'
import { feedbackEmailSchema, type FeedbackEmailInput } from '../../contracts/feedback'
import { emailFeedback } from './feedback'

const mocks = vi.hoisted(() => ({
  send: vi.fn(),
  adminEmails: vi.fn(),
  email: true,
  originAllowed: true,
  address: '203.0.113.1',
}))
vi.mock('@tanstack/react-start', () => {
  const builder = () => ({ validator: () => builder(), handler: (handler: unknown) => handler })
  return { createServerFn: builder }
})
vi.mock('@tanstack/react-start/server', () => ({
  getRequest: () => new Request('https://praetorium.gg/_serverFn', { headers: { 'X-Forwarded-For': mocks.address } }),
}))
vi.mock('../rpc', () => ({
  mutationRpc: async (work: () => unknown) => {
    if (!mocks.originAllowed) throw new Response('invalid origin', { status: 403 })
    return work()
  },
}))
vi.mock('../app', () => ({
  app: () => ({ email: mocks.email ? { send: mocks.send } : undefined, service: { adminEmails: mocks.adminEmails } }),
}))
vi.mock('../playerSession', () => ({ currentUser: async () => null }))
vi.mock('../feedbackScreenshots', () => ({ storeFeedbackScreenshot: vi.fn() }))

const send = emailFeedback as unknown as (input: { data: FeedbackEmailInput }) => Promise<null>
const input: FeedbackEmailInput = { kind: 'Idea', message: 'More factions', automatic: false, pageUrl: 'https://praetorium.gg/' }
let address = 0

beforeEach(() => {
  vi.clearAllMocks()
  mocks.email = true
  mocks.originAllowed = true
  // Each test gets its own address, so the per-address limit starts empty.
  mocks.address = `203.0.113.${++address}`
  mocks.adminEmails.mockResolvedValue(['one@example.com', 'two@example.com'])
  mocks.send.mockResolvedValue(undefined)
})

describe('emailFeedback', () => {
  it('emails every administrator', async () => {
    await send({ data: input })
    expect(mocks.send.mock.calls.map(([message]) => message.to)).toEqual(['one@example.com', 'two@example.com'])
  })

  it('sends nothing for a request from another origin', async () => {
    mocks.originAllowed = false
    await send({ data: input }).catch(() => null)
    expect(mocks.send).not.toHaveBeenCalled()
  })

  it('does nothing where this instance sends no email', async () => {
    mocks.email = false
    expect([await send({ data: input }), mocks.adminEmails.mock.calls.length]).toEqual([null, 0])
  })

  it('refuses a sixth email from one address within a minute', async () => {
    for (let attempt = 0; attempt < 5; attempt++) await send({ data: input })
    await expect(send({ data: input })).rejects.toHaveProperty('status', 429)
  })

  it('reports a failed delivery to the caller, which the server logs', async () => {
    mocks.send.mockRejectedValue(new Error('SMTP refused'))
    await expect(send({ data: input })).rejects.toThrow('SMTP refused')
  })
})

describe('feedbackEmailSchema', () => {
  it('refuses an empty message', () => {
    expect(feedbackEmailSchema.safeParse({ ...input, message: '   ' }).success).toBe(false)
  })

  it('refuses a page that is not a web address', () => {
    expect(feedbackEmailSchema.safeParse({ ...input, pageUrl: 'javascript:alert(1)' }).success).toBe(false)
  })
})

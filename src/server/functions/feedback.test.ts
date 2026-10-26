import { beforeEach, describe, expect, it, vi } from 'vitest'
import { feedbackEmailSchema, type FeedbackEmailInput } from '../../contracts/feedback'
import { emailFeedback, supportIdentity } from './feedback'

const mocks = vi.hoisted(() => ({
  send: vi.fn(),
  adminEmails: vi.fn(),
  email: true,
  originAllowed: true,
  address: '203.0.113.1',
  userId: null as string | null,
}))
vi.mock('@tanstack/react-start', () => {
  const builder = () => ({ validator: () => builder(), handler: (handler: unknown) => handler })
  return { createServerFn: builder }
})
vi.mock('@tanstack/react-start/server', () => ({
  getRequest: () => new Request('https://praetorium.gg/_serverFn', { headers: { 'X-Forwarded-For': mocks.address } }),
}))
vi.mock('../rpc', () => ({
  rpc: (work: () => unknown) => work(),
  mutationRpc: async (work: () => unknown) => {
    if (!mocks.originAllowed) throw new Response('invalid origin', { status: 403 })
    return work()
  },
}))
vi.mock('../app', () => ({
  app: () => ({ email: mocks.email ? { send: mocks.send } : undefined, service: { adminEmails: mocks.adminEmails } }),
}))
vi.mock('../playerSession', () => ({
  currentUser: async () => null,
  forSignedIn: async (signedOut: unknown, work: (userId: string) => unknown) => (mocks.userId ? work(mocks.userId) : signedOut),
}))
vi.mock('../feedbackScreenshots', () => ({ storeFeedbackScreenshot: vi.fn() }))

const send = emailFeedback as unknown as (input: { data: FeedbackEmailInput }) => Promise<null>
const input: FeedbackEmailInput = { message: 'Automatic report: roster import failed', pageUrl: 'https://praetorium.gg/' }
let address = 0

beforeEach(() => {
  vi.clearAllMocks()
  mocks.email = true
  mocks.originAllowed = true
  mocks.userId = null
  delete process.env.POSTHOG_SUPPORT_IDENTITY_SECRET
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

describe('supportIdentity', () => {
  const identity = supportIdentity as unknown as () => Promise<{ distinctId: string; hash: string } | null>

  it('signs the signed-in account id with the support secret', async () => {
    process.env.POSTHOG_SUPPORT_IDENTITY_SECRET = 'secret'
    mocks.userId = 'user-1'
    // HMAC-SHA256 of "user-1" keyed with "secret", computed independently with openssl.
    expect(await identity()).toEqual({ distinctId: 'user-1', hash: '1d16fd7e96e8a9681f283b8a251822ffdc71e2a5bda0c5267a044874fa21b82b' })
  })

  it('proves nothing for a guest', async () => {
    process.env.POSTHOG_SUPPORT_IDENTITY_SECRET = 'secret'
    expect(await identity()).toBeNull()
  })

  it('proves nothing where this instance has no support secret', async () => {
    mocks.userId = 'user-1'
    expect(await identity()).toBeNull()
  })
})

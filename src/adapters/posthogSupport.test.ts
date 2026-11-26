import { afterEach, expect, it, vi } from 'vitest'
import { createHmac } from 'node:crypto'
import { posthogSupportInbox, posthogSupportTickets } from './posthogSupport'

const environment = { POSTHOG_SUPPORT_API_KEY: 'phx_test', POSTHOG_HOST: 'https://us.posthog.com', POSTHOG_PROJECT_ID: '548119' }
const message = (minute: number) => ({
  author_type: 'support',
  is_private: false,
  created_at: `2026-10-24T05:${String(minute).padStart(2, '0')}:00Z`,
})

afterEach(() => vi.unstubAllGlobals())

it('reads every page of a conversation, as its newest messages decide whether to email', async () => {
  const base = 'https://us.posthog.com/api/projects/548119/conversations/tickets/t-1'
  const pages: Record<string, unknown> = {
    [`${base}/`]: { distinct_id: 'user-1', anonymous_traits: null },
    [`${base}/messages/`]: { count: 2, next: `${base}/messages/?offset=1`, results: [message(0)] },
    [`${base}/messages/?offset=1`]: { count: 2, next: null, results: [message(1)] },
  }
  vi.stubGlobal('fetch', async (url: URL) => Response.json(pages[url.href]))

  const read = await posthogSupportTickets(environment)!('t-1')

  expect(read?.messages.map((one) => one.created_at)).toEqual([message(0).created_at, message(1).created_at])
})

it('reads nothing where no ticket key is configured', () => {
  expect(posthogSupportTickets({ ...environment, POSTHOG_SUPPORT_API_KEY: '' })).toBeUndefined()
})

const widget = {
  POSTHOG_SUPPORT_IDENTITY_SECRET: 'secret',
  VITE_POSTHOG_PROJECT_TOKEN: 'phc_test',
  VITE_POSTHOG_HOST: 'https://us.i.posthog.com',
}

it('opens a conversation as the account the browser proves, so it shows on the player’s Support page', async () => {
  const sent: { url: string; token: string | null; body: unknown }[] = []
  vi.stubGlobal('fetch', async (url: URL, init?: RequestInit) => {
    if (url.href === 'https://us-assets.i.posthog.com/array/phc_test/config')
      return Response.json({ conversations: { enabled: true, token: 'conversations-token' } })
    sent.push({ url: url.href, token: new Headers(init?.headers).get('X-Conversations-Token'), body: JSON.parse(init?.body as string) })
    return Response.json({ ticket_id: 't-1' })
  })

  await posthogSupportInbox(widget)!.start('user-1', 'Rule missing')

  expect(sent).toEqual([
    {
      url: 'https://us.i.posthog.com/api/conversations/v1/widget/message',
      token: 'conversations-token',
      body: expect.objectContaining({
        message: 'Rule missing',
        ticket_id: null,
        distinct_id: 'user-1',
        identity_distinct_id: 'user-1',
        identity_hash: createHmac('sha256', 'secret').update('user-1').digest('hex'),
      }),
    },
  ])
})

it('reaches no Support inbox where this instance proves no identities', () => {
  expect(posthogSupportInbox({ ...widget, POSTHOG_SUPPORT_IDENTITY_SECRET: '' })).toBeUndefined()
})

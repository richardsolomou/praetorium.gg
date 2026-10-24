import { afterEach, expect, it, vi } from 'vitest'
import { posthogSupportTickets } from './posthogSupport'

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

import { afterEach, expect, it, vi } from 'vitest'
import { EMAIL_TEMPLATES, emailDelivery } from './email'

const environment = { POSTHOG_EMAIL_API_KEY: 'phs_test', POSTHOG_HOST: 'https://us.posthog.com' }
const message = {
  template: 'resetPassword' as const,
  to: 'ana@example.com',
  distinctId: 'user-1',
  data: { url: 'https://praetorium.gg/r' },
}

afterEach(() => vi.unstubAllGlobals())

it('sends the template by its PostHog id with the idempotency key as a header', async () => {
  const fetch = vi.fn(async (_url: URL, _init: RequestInit) => Response.json({ message_id: 'm-1' }, { status: 202 }))
  vi.stubGlobal('fetch', fetch)

  await emailDelivery(environment)!.send({ ...message, idempotencyKey: 'reset:1' })

  const [url, init] = fetch.mock.calls[0]!
  expect([url.href, (init.headers as Record<string, string>)['Idempotency-Key'], JSON.parse(init.body as string)]).toEqual([
    'https://us.posthog.com/api/projects/@current/messaging/send/email/',
    'reset:1',
    {
      template_id: EMAIL_TEMPLATES.resetPassword,
      to: 'ana@example.com',
      distinct_id: 'user-1',
      message_data: { url: 'https://praetorium.gg/r' },
    },
  ])
})

it('fails with the error code PostHog gives, so a refused send reaches the caller', async () => {
  vi.stubGlobal('fetch', async () => Response.json({ type: 'validation_error', code: 'recipient_suppressed' }, { status: 422 }))
  await expect(emailDelivery(environment)!.send(message)).rejects.toThrow('PostHog email answered 422 recipient_suppressed')
})

it('sends nothing where no email key is configured', () => {
  expect(emailDelivery({ ...environment, POSTHOG_EMAIL_API_KEY: '' })).toBeUndefined()
})

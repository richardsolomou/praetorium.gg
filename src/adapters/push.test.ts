import { describe, expect, it, vi } from 'vitest'
import { expoPushSender, type PushMessage, pushSenderFromEnvironment } from './push'

const message = (index: number): PushMessage => ({
  to: `ExponentPushToken[device-${index}]`,
  title: 'New battle',
  body: 'Alice started a battle with you.',
  path: '/battles/abc',
})

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

function sender(respond: (url: string, body: unknown) => Response | Promise<Response>) {
  const requests: { url: string; body: unknown; headers: Headers }[] = []
  const unregistered: string[][] = []
  const deferred: (() => void)[] = []
  const push = expoPushSender({
    accessToken: 'access-token',
    onUnregistered: (tokens) => {
      unregistered.push(tokens)
    },
    fetch: vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = input instanceof Request ? input.url : input.toString()
      const body = JSON.parse(init?.body as string) as unknown
      requests.push({ url, body, headers: new Headers(init?.headers) })
      return respond(url, body)
    }),
    sleep: async () => undefined,
    later: (work) => {
      deferred.push(work)
    },
    log: () => undefined,
  })
  return { push, requests, unregistered, deferred }
}

const okTickets = (body: unknown) => json({ data: (body as unknown[]).map((_, index) => ({ status: 'ok', id: `ticket-${index}` })) })

describe('Expo push sender', () => {
  it('is absent without an access token', () => {
    expect(pushSenderFromEnvironment(() => undefined, {})).toBeNull()
  })

  it('authenticates with the configured access token', async () => {
    const { push, requests } = sender((_url, body) => okTickets(body))

    await push.send([message(0)])

    expect(requests[0]?.headers.get('authorization')).toBe('Bearer access-token')
  })

  it('puts the destination path in the data payload', async () => {
    const { push, requests } = sender((_url, body) => okTickets(body))

    await push.send([message(0)])

    expect(requests[0]?.body).toEqual([expect.objectContaining({ to: message(0).to, data: { path: '/battles/abc' } })])
  })

  it('sends at most one hundred messages per request', async () => {
    const { push, requests } = sender((_url, body) => okTickets(body))

    await push.send(Array.from({ length: 250 }, (_, index) => message(index)))

    expect(requests.map((request) => (request.body as unknown[]).length)).toEqual([100, 100, 50])
  })

  it('forgets a device whose ticket reports it is no longer registered', async () => {
    const { push, unregistered } = sender(() =>
      json({
        data: [
          { status: 'ok', id: 'one' },
          { status: 'error', message: 'gone', details: { error: 'DeviceNotRegistered' } },
        ],
      }),
    )

    await push.send([message(0), message(1)])

    expect(unregistered).toEqual([[message(1).to]])
  })

  it('keeps a device whose ticket failed for another reason', async () => {
    const { push, unregistered } = sender(() => json({ data: [{ status: 'error', message: 'big', details: { error: 'MessageTooBig' } }] }))

    await push.send([message(0)])

    expect(unregistered).toEqual([])
  })

  it('forgets a device whose later receipt reports it is no longer registered', async () => {
    const { push, deferred, unregistered } = sender((url, body) =>
      url.endsWith('/getReceipts')
        ? json({ data: { 'ticket-0': { status: 'ok' }, 'ticket-1': { status: 'error', details: { error: 'DeviceNotRegistered' } } } })
        : okTickets(body),
    )
    await push.send([message(0), message(1)])

    deferred.forEach((work) => work())
    await vi.waitFor(() => expect(unregistered).toEqual([[message(1).to]]))
  })

  it('skips receipt timers when no durable scheduler is available', async () => {
    const later = vi.fn()
    const push = expoPushSender({
      accessToken: 'access-token',
      onUnregistered: () => undefined,
      checkReceipts: false,
      fetch: async (_input, init) => okTickets(JSON.parse(init?.body as string)),
      later,
    })

    await push.send([message(0)])

    expect(later).not.toHaveBeenCalled()
  })

  it('retries a server error a bounded number of times', async () => {
    const { push, requests } = sender(() => json({ errors: [{ code: 'INTERNAL' }] }, 503))

    await push.send([message(0)])

    expect(requests).toHaveLength(3)
  })

  it('does not retry a request the service refused as invalid', async () => {
    const { push, requests } = sender(() => json({ errors: [{ code: 'UNAUTHORIZED' }] }, 401))

    await push.send([message(0)])

    expect(requests).toHaveLength(1)
  })

  it('resolves rather than throwing when every attempt times out', async () => {
    const { push } = sender(() => {
      throw new DOMException('The operation was aborted due to timeout', 'TimeoutError')
    })

    await expect(push.send([message(0)])).resolves.toBeUndefined()
  })

  it('resolves rather than throwing when forgetting a device fails', async () => {
    const push = expoPushSender({
      accessToken: 'access-token',
      onUnregistered: () => Promise.reject(new Error('database down')),
      fetch: async () => json({ data: [{ status: 'error', details: { error: 'DeviceNotRegistered' } }] }),
      sleep: async () => undefined,
      later: () => undefined,
      log: () => undefined,
    })

    await expect(push.send([message(0)])).resolves.toBeUndefined()
  })
})

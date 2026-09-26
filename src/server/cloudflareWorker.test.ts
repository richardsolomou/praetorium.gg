import { afterEach, expect, it, vi } from 'vitest'
import { spacetimeSocket } from '../../cloudflare/spacetimeProxy'

const environment = {
  SPACETIME_DATABASE: 'preview-one',
  SPACETIME_URL: 'https://private.example/',
  SPACETIME_ACCESS_CLIENT_ID: 'client-id',
  SPACETIME_ACCESS_CLIENT_SECRET: 'client-secret',
}

afterEach(() => vi.unstubAllGlobals())

it('proxies only authenticated subscription traffic to the configured database', async () => {
  const upstream = vi.fn(async (_request: Request) => new Response('accepted'))
  vi.stubGlobal('fetch', upstream)
  const request = new Request('https://preview.example/spacetime/v1/database/preview-one/subscribe?token=short-lived', {
    headers: { upgrade: 'websocket', cookie: 'session=private' },
  })
  expect((await spacetimeSocket(request, environment)).status).toBe(200)
  const sent = upstream.mock.calls[0]![0]
  expect(new URL(sent.url).toString()).toBe('https://private.example/v1/database/preview-one/subscribe?token=short-lived')
  expect(sent.headers.get('cookie')).toBeNull()
  expect(sent.headers.get('CF-Access-Client-Id')).toBe('client-id')
  expect(sent.headers.get('CF-Access-Client-Secret')).toBe('client-secret')
  expect((await spacetimeSocket(new Request('https://preview.example/spacetime/v1/database/preview-one/sql'), environment)).status).toBe(
    404,
  )
  expect(
    (
      await spacetimeSocket(
        new Request('https://preview.example/spacetime/v1/database/other/subscribe?token=short-lived', {
          headers: { upgrade: 'websocket' },
        }),
        environment,
      )
    ).status,
  ).toBe(404)
  expect(upstream).toHaveBeenCalledTimes(1)
})

it('requires bearer authorization for websocket token exchange', async () => {
  const upstream = vi.fn(async (_request: Request) => Response.json({ token: 'temporary' }))
  vi.stubGlobal('fetch', upstream)
  const url = 'https://preview.example/spacetime/v1/identity/websocket-token'
  expect((await spacetimeSocket(new Request(url, { method: 'POST' }), environment)).status).toBe(401)
  expect(
    (
      await spacetimeSocket(
        new Request(url, {
          method: 'POST',
          headers: { authorization: 'Bearer signed' },
          body: '{"want":"token"}',
        }),
        environment,
      )
    ).status,
  ).toBe(200)
  expect(await upstream.mock.calls[0]![0].text()).toBe('{"want":"token"}')
  expect(
    (
      await spacetimeSocket(
        new Request(url, {
          method: 'POST',
          headers: { authorization: 'Bearer signed' },
          body: 'x'.repeat(4_097),
        }),
        environment,
      )
    ).status,
  ).toBe(413)
  expect(upstream).toHaveBeenCalledTimes(1)
})

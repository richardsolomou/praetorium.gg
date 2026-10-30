import { afterEach, expect, it, vi } from 'vitest'

const { capture } = vi.hoisted(() => ({ capture: vi.fn(async () => {}) }))
vi.mock('./adapters/posthog', () => ({ serverTelemetry: () => ({ capture }) }))

import { startInstance } from './start'

afterEach(() => {
  vi.unstubAllEnvs()
  capture.mockClear()
})

async function request(url: string) {
  const { requestMiddleware } = await startInstance.getOptions()
  const middleware = requestMiddleware?.[0]
  if (!middleware?.options.server) throw new Error('Missing canonical-host middleware')
  return middleware.options.server({
    request: new Request(url),
    next: () => new Response('application'),
  } as never) as Promise<Response>
}

it('redirects an old public hostname while preserving the path and query', async () => {
  vi.stubEnv('APP_URL', 'https://praetorium.gg')
  const response = await request('https://old.example/battles/one?view=score')
  expect(response.headers.get('location')).toBe('https://praetorium.gg/battles/one?view=score')
})

it('serves the health check on any hostname', async () => {
  vi.stubEnv('APP_URL', 'https://praetorium.gg')
  expect(await (await request('https://old.example/api/health')).text()).toBe('application')
})

async function served(url: string) {
  const { requestMiddleware } = await startInstance.getOptions()
  const middleware = requestMiddleware?.[1]
  if (!middleware?.options.server) throw new Error('Missing crawler request middleware')
  const response = new Response('application', { status: 200 })
  return middleware.options.server({ request: new Request(url), next: () => ({ response }) } as never)
}

it('records a public page read as an HTTP log', async () => {
  await served('https://praetorium.gg/factions/necrons')
  expect(capture).toHaveBeenCalledWith(
    expect.stringMatching(/^http_log_/),
    '$http_log',
    expect.objectContaining({ $pathname: '/factions/necrons' }),
  )
})

it('records nothing for a page that can name a player', async () => {
  await served('https://praetorium.gg/battles/secret-token')
  expect(capture).not.toHaveBeenCalled()
})

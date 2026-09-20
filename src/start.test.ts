import { afterEach, expect, it, vi } from 'vitest'
import { startInstance } from './start'

afterEach(() => vi.unstubAllEnvs())

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

it.each([
  'https://old.example/api/health',
  'http://127.0.0.1:3001/api/auth/session',
  'http://localhost:3001/',
  'https://praetorium.gg/battles',
])('serves %s without a redirect', async (url) => {
  vi.stubEnv('APP_URL', 'https://praetorium.gg')
  expect(await (await request(url)).text()).toBe('application')
})

it('leaves unconfigured deployments on their incoming host', async () => {
  vi.stubEnv('APP_URL', '')
  expect(await (await request('https://self-hosted.example/')).text()).toBe('application')
})

import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { Route } from './health'

const { ready, execute } = vi.hoisted(() => ({ ready: vi.fn(), execute: vi.fn() }))
vi.mock('../../server/app', () => ({ app: () => ({ ready, database: { execute } }) }))
beforeEach(() => {
  ready.mockReset().mockResolvedValue(undefined)
  execute.mockReset().mockResolvedValue(undefined)
})
afterEach(() => vi.unstubAllEnvs())

async function health() {
  const handlers = Route.options.server?.handlers
  if (!handlers || typeof handlers === 'function' || typeof handlers.GET !== 'function') throw new Error('Missing health handler')
  return handlers.GET({} as never) as Promise<Response>
}

it('checks the application database before reporting health', async () => {
  await health()
  expect(execute).toHaveBeenCalledOnce()
})

it('identifies the ready release for deployment verification', async () => {
  vi.stubEnv('GITHUB_SHA', 'release-sha')
  expect((await health()).headers.get('x-praetorium-revision')).toBe('release-sha')
})

it('redacts a real health-handler database failure', async () => {
  vi.stubEnv('GITHUB_SHA', 'failed-release-sha')
  execute.mockRejectedValue(new Error('postgres://user:secret@db/private'))
  const response = await health()
  expect(response.status).toBe(503)
  expect(response.headers.get('x-praetorium-revision')).toBeNull()
  expect(await response.json()).toEqual({ ok: false, error: 'database unavailable', code: 'database_unavailable' })
})

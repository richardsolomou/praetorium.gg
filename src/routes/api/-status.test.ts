import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, expect, it, vi } from 'vitest'
import { Route } from './status'

const { check } = vi.hoisted(() => ({ check: vi.fn() }))
vi.mock('../../server/app', () => ({ app: () => ({ health: check, sync: () => ({ status: 'ready', detail: null }) }) }))
vi.mock('../../server/catalogueIndex', () => ({ catalogueDirectory: () => '/nonexistent-catalogue' }))
afterEach(() => {
  vi.unstubAllEnvs()
  vi.useRealTimers()
})

async function status() {
  const handlers = Route.options.server?.handlers
  if (!handlers || typeof handlers === 'function' || typeof handlers.GET !== 'function') throw new Error('Missing status handler')
  return handlers.GET({} as never) as Promise<Response>
}

it('says a failed health check is down without its reason', async () => {
  vi.stubEnv('GITHUB_SHA', 'release-sha')
  check.mockRejectedValue(new Error('https://token:secret@storage.example/private'))
  const response = await status()
  expect(response.headers.get('cache-control')).toBe('no-store')
  const body = await response.text()
  expect(body).not.toContain('secret')
  expect(JSON.parse(body)).toMatchObject({
    up: false,
    commit: 'release-sha',
    catalogue: { sync: 'ready', snapshot: null },
    rulesVersions: [],
  })
})

it('names the live catalogue revision a server follows past its pinned snapshot', async () => {
  const live = fs.mkdtempSync(path.join(os.tmpdir(), 'status-live-'))
  const id = 'a'.repeat(64)
  fs.writeFileSync(path.join(live, 'current.json'), JSON.stringify({ id }))
  vi.stubEnv('CATALOGUE_LIVE_DIR', live)
  // Past the window in which every reader shares one answer.
  vi.useFakeTimers({ toFake: ['Date'], now: Date.now() + 60_000 })
  check.mockResolvedValue(undefined)
  expect((await (await status()).json()).catalogue.snapshot).toBe(id)
})

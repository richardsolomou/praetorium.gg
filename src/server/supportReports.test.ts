import { expect, it, vi } from 'vitest'
import { githubSupport } from '../adapters/githubSupport'
import { supportDraft } from '../core/supportReport.fixtures'
import { supportReports } from './supportReports'

it('refuses unconfigured public submission before creating a local report', async () => {
  const store = vi.fn(async () => null)
  await expect(
    supportReports(store, githubSupport(undefined)).submit('player', { ...supportDraft, publishPublicly: true }),
  ).rejects.toMatchObject({ status: 503 })
  expect(store).not.toHaveBeenCalled()
})

it('requires explicit publication consent before touching persistence', async () => {
  const store = vi.fn(async () => null)
  await expect(
    supportReports(store, githubSupport('service')).submit('player', { ...supportDraft, publishPublicly: false }),
  ).rejects.toThrow()
  expect(store).not.toHaveBeenCalled()
})

it('does not read GitHub for a missing requester-owned report', async () => {
  const request = vi.fn(async () => Response.json({}))
  await expect(
    supportReports(async () => null, githubSupport('service', request)).check('player', supportDraft.reference, 1),
  ).rejects.toMatchObject({ status: 404 })
  expect(request).not.toHaveBeenCalled()
})

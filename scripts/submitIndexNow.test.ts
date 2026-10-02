import { expect, it, vi } from 'vitest'
import { submitIndexNow } from './submitIndexNow'

const KEY = '0123456789abcdef'
const REVISION = 'a'.repeat(40)
const before = '<urlset><url><loc>https://praetorium.gg/a</loc></url></urlset>'
const after = '<urlset><url><loc>https://praetorium.gg/a</loc></url><url><loc>https://praetorium.gg/b</loc></url></urlset>'

const href = (input: URL | RequestInfo) => (input instanceof Request ? input.url : input instanceof URL ? input.href : input)

function production({ revisions = [REVISION], key = KEY, indexNow = 200 } = {}) {
  const submitted: unknown[] = []
  let health = 0
  const request = vi.fn(async (input: URL | RequestInfo, init?: RequestInit) => {
    const url = href(input)
    if (url.endsWith('/api/health')) {
      const revision = revisions[Math.min(health++, revisions.length - 1)]!
      return new Response('{"ok":true}', { headers: { 'x-praetorium-revision': revision } })
    }
    if (url.endsWith('/indexnow.txt')) return new Response(key)
    if (url.endsWith('/sitemap.xml')) return new Response(after)
    submitted.push(JSON.parse(typeof init?.body === 'string' ? init.body : 'null'))
    return new Response(null, { status: indexNow })
  }) as unknown as typeof fetch
  return { request, submitted }
}

const options = (request: typeof fetch) => ({
  key: KEY,
  revision: REVISION,
  origin: 'https://praetorium.gg',
  before,
  request,
  sleep: async () => {},
})

it('submits the pages the deploy added', async () => {
  const { request, submitted } = production()
  await submitIndexNow(options(request))
  expect(submitted).toEqual([
    { host: 'praetorium.gg', key: KEY, keyLocation: 'https://praetorium.gg/indexnow.txt', urlList: ['https://praetorium.gg/b'] },
  ])
})

it('waits for every replica to serve the new revision before reading the sitemap', async () => {
  const { request, submitted } = production({ revisions: ['old', REVISION, 'old', REVISION] })
  await submitIndexNow(options(request))
  expect(vi.mocked(request).mock.calls.filter(([url]) => href(url).endsWith('/api/health'))).toHaveLength(8)
  expect(submitted).toHaveLength(1)
})

it('submits nothing while no key is configured', async () => {
  const { request } = production()
  await submitIndexNow({ ...options(request), key: undefined })
  expect(request).not.toHaveBeenCalled()
})

it('submits nothing without an earlier sitemap to compare with', async () => {
  const { request } = production()
  await submitIndexNow({ ...options(request), before: '' })
  expect(request).not.toHaveBeenCalled()
})

it('refuses to submit while production serves another key', async () => {
  const { request } = production({ key: 'fedcba9876543210' })
  await expect(submitIndexNow(options(request))).rejects.toThrow('does not serve the configured key')
})

it('fails when IndexNow turns the submission away', async () => {
  const { request } = production({ indexNow: 403 })
  await expect(submitIndexNow(options(request))).rejects.toThrow('IndexNow answered 403')
})

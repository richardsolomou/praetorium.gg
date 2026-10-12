import { describe, expect, it, vi } from 'vitest'
import { githubSupport } from './githubSupport'
import { publicSupportPayload } from '../core/supportReport'
import { supportDraft } from '../core/supportReport.fixtures'

const payload = publicSupportPayload(supportDraft)
const issue = { ...payload, number: 123, state: 'open', state_reason: null, user: { id: 7 } }

describe('GitHub support transport', () => {
  it('sends only the reviewed title and body to the fixed public repository', async () => {
    const request = vi.fn(async (_url: string, _init: RequestInit) => Response.json(issue, { status: 201 }))
    await githubSupport('service-secret', request).create(payload)
    const [url, init] = request.mock.calls[0]!
    expect({ url, method: init.method, redirect: init.redirect, body: JSON.parse(init.body as string) }).toEqual({
      url: 'https://api.github.com/repos/richardsolomou/praetorium.gg/issues',
      method: 'POST',
      redirect: 'error',
      body: payload,
    })
  })
  it('confirms receipt only after a parsed GitHub 201', async () => {
    expect(await githubSupport('token', async () => Response.json(issue, { status: 201 })).create(payload)).toEqual({
      delivery: 'received',
      issueNumber: 123,
    })
  })
  it.each([400, 401, 403, 404, 410, 422, 429])('records a definitive GitHub refusal (%s)', async (status) => {
    expect(await githubSupport('token', async () => new Response(null, { status })).create(payload)).toEqual({
      delivery: 'refused',
      issueNumber: null,
    })
  })
  it.each([200, 301, 502, 503])('leaves an unexpected outcome unconfirmed (%s)', async (status) => {
    expect(await githubSupport('token', async () => new Response(null, { status })).create(payload)).toEqual({
      delivery: 'uncertain',
      issueNumber: null,
    })
  })
  it('does not retry a timeout which could follow a successful write', async () => {
    const request = vi.fn(async () => {
      throw new Error('connection closed')
    })
    await githubSupport('token', request).create(payload)
    expect(request).toHaveBeenCalledTimes(1)
  })
  it('leaves a malformed successful response unconfirmed', async () => {
    expect(await githubSupport('token', async () => Response.json({ number: 123 }, { status: 201 })).create(payload)).toEqual({
      delivery: 'uncertain',
      issueNumber: null,
    })
  })
  it('requires an exact title and complete body when reconciling a reference', async () => {
    const record = { reference: supportDraft.reference, ...payload, createdAt: 0, delivery: 'uncertain' as const, issueNumber: null }
    const transport = githubSupport('token', async (url) =>
      url.endsWith('/user')
        ? Response.json({ id: 7 })
        : Response.json({ incomplete_results: false, items: [{ ...issue, body: `${issue.body}\nmodified` }] }),
    )
    expect(await transport.find(record)).toBeNull()
  })
  it('refuses an incomplete reference search', async () => {
    const record = { reference: supportDraft.reference, ...payload, createdAt: 0, delivery: 'uncertain' as const, issueNumber: null }
    await expect(
      githubSupport('token', async (url) =>
        url.endsWith('/user') ? Response.json({ id: 7 }) : Response.json({ incomplete_results: true, items: [] }),
      ).find(record),
    ).rejects.toThrow('incomplete')
  })
  it('does not bind a copied public payload written by someone else', async () => {
    const record = { reference: supportDraft.reference, ...payload, createdAt: 0, delivery: 'uncertain' as const, issueNumber: null }
    const transport = githubSupport('token', async (url) =>
      url.endsWith('/user')
        ? Response.json({ id: 7 })
        : Response.json({ incomplete_results: false, items: [{ ...issue, user: { id: 9 } }] }),
    )
    expect(await transport.find(record)).toBeNull()
  })
  it('returns reply text without rendering HTML, images or links', async () => {
    const result = await githubSupport('token', async () =>
      Response.json([{ id: 1, body: '<img src="private">', created_at: '2026-10-11T00:00:00Z', user: { login: 'maintainer' } }]),
    ).replies(123, 1)
    expect(result).toEqual({
      replies: [{ id: 1, body: '<img src="private">', at: '2026-10-11T00:00:00Z', author: 'maintainer' }],
      more: false,
    })
  })
  it('rejects an oversized response before parsing it', async () => {
    await expect(githubSupport('token', async () => new Response('a'.repeat(2_000_001))).issue(123)).rejects.toThrow('exceeds the limit')
  })
  it('refuses any network request without its dedicated service credential', async () => {
    const request = vi.fn(async () => Response.json(issue, { status: 201 }))
    await githubSupport(undefined, request).create(payload)
    expect(request).not.toHaveBeenCalled()
  })
})

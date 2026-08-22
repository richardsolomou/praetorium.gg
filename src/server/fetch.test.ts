import { afterEach, describe, expect, it, vi } from 'vitest'
import { fetchWithRetry } from './fetch'

afterEach(() => vi.unstubAllGlobals())

describe('fetchWithRetry', () => {
  it('retries transient responses', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(new Response(null, { status: 503 }))
      .mockResolvedValue(new Response('ready'))
    vi.stubGlobal('fetch', fetch)

    expect(await (await fetchWithRetry('https://example.test', {}, { minTimeoutMs: 0 })).text()).toBe('ready')
    expect(fetch).toHaveBeenCalledTimes(2)
  })

  it('does not retry permanent responses', async () => {
    const fetch = vi.fn().mockResolvedValue(new Response(null, { status: 404 }))
    vi.stubGlobal('fetch', fetch)

    expect((await fetchWithRetry('https://example.test', {}, { minTimeoutMs: 0 })).status).toBe(404)
    expect(fetch).toHaveBeenCalledTimes(1)
  })

  it('stops after the configured attempt limit', async () => {
    const fetch = vi.fn().mockRejectedValue(new TypeError('fetch failed'))
    vi.stubGlobal('fetch', fetch)

    await expect(fetchWithRetry('https://example.test', {}, { attempts: 2, minTimeoutMs: 0 })).rejects.toThrow('fetch failed')
    expect(fetch).toHaveBeenCalledTimes(2)
  })
})

import { afterEach, describe, expect, it, vi } from 'vitest'
import { configuredObjectStore, putIfAbsent } from './objectStorage'

afterEach(() => {
  delete process.env.S3_PUBLIC_BASE_URL
  delete process.env.R2_ACCOUNT_ID
  delete process.env.R2_ACCESS_KEY_ID
  delete process.env.R2_SECRET_ACCESS_KEY
  vi.unstubAllGlobals()
})

describe('configuredObjectStore', () => {
  it('requires object storage configuration', () => {
    expect(configuredObjectStore()).toBeNull()
  })

  it('signs a Node avatar upload to the private bucket', async () => {
    process.env.R2_ACCOUNT_ID = 'a'.repeat(32)
    process.env.R2_ACCESS_KEY_ID = 'key'
    process.env.R2_SECRET_ACCESS_KEY = 'secret'
    const requests: Request[] = []
    vi.stubGlobal('fetch', async (request: Request) => {
      requests.push(request)
      return new Response(null, { status: request.method === 'HEAD' ? 404 : 200 })
    })
    const store = configuredObjectStore()
    await putIfAbsent(store!, 'avatars/example.webp', new Uint8Array([1, 2]), 'image/webp')
    expect(requests.map((request) => [request.method, request.url, request.headers.has('authorization')])).toEqual([
      ['HEAD', `https://${'a'.repeat(32)}.r2.cloudflarestorage.com/praetorium/avatars/example.webp`, true],
      ['PUT', `https://${'a'.repeat(32)}.r2.cloudflarestorage.com/praetorium/avatars/example.webp`, true],
    ])
  })

  it('rejects incomplete Node object storage credentials', () => {
    process.env.R2_ACCOUNT_ID = 'a'.repeat(32)
    expect(() => configuredObjectStore()).toThrow('Incomplete R2 object storage configuration')
  })
})

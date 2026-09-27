import type { R2Bucket } from '@cloudflare/workers-types'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { configuredObjectStore, DEFAULT_S3_PUBLIC_BASE_URL, putIfAbsent } from './objectStorage'
import { withWorkerAppContext } from './workerAppContext'

afterEach(() => {
  delete process.env.S3_PUBLIC_BASE_URL
})

describe('configuredObjectStore', () => {
  it('requires the Worker R2 binding', () => {
    expect(configuredObjectStore()).toBeNull()
  })

  it('writes an avatar through the Worker R2 binding', async () => {
    const head = vi.fn(async () => null)
    const put = vi.fn(async () => ({}))
    const bucket = { head, put } as unknown as R2Bucket
    await withWorkerAppContext(
      async () => {
        const store = configuredObjectStore()
        expect(store?.publicBaseUrl).toBe(DEFAULT_S3_PUBLIC_BASE_URL)
        await putIfAbsent(store!, 'avatars/example.webp', new Uint8Array([1, 2]), 'image/webp')
      },
      { waitUntil: () => {} },
      undefined,
      bucket,
    )
    expect(put).toHaveBeenCalledWith('praetorium/avatars/example.webp', new Uint8Array([1, 2]), {
      httpMetadata: { contentType: 'image/webp', cacheControl: 'public, max-age=31536000, immutable' },
    })
  })

  it('serves local R2 uploads from the local Worker origin', async () => {
    process.env.S3_PUBLIC_BASE_URL = 'http://127.0.0.1:3000/praetorium/'
    const bucket = { head: vi.fn(async () => ({})), put: vi.fn() } as unknown as R2Bucket
    await withWorkerAppContext(
      async () => {
        expect(configuredObjectStore()?.publicBaseUrl).toBe('http://127.0.0.1:3000/praetorium')
      },
      { waitUntil: () => {} },
      undefined,
      bucket,
    )
  })
})

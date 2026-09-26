import type { R2Bucket } from '@cloudflare/workers-types'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { configuredObjectStore, DEFAULT_S3_PUBLIC_BASE_URL, putIfAbsent } from './objectStorage'
import { withWorkerAppContext } from './workerAppContext'

const ENV_KEYS = ['S3_ENDPOINT', 'S3_BUCKET', 'S3_ACCESS_KEY_ID', 'S3_SECRET_ACCESS_KEY', 'S3_PUBLIC_BASE_URL', 'S3_REGION'] as const

afterEach(() => {
  for (const key of ENV_KEYS) delete process.env[key]
})

describe('configuredObjectStore', () => {
  it('is null until every credential is set', () => {
    expect(configuredObjectStore()).toBeNull()
    process.env.S3_ENDPOINT = 'http://minio:9000'
    process.env.S3_BUCKET = 'praetorium'
    expect(configuredObjectStore()).toBeNull()
  })

  it('falls back to the shared public store when no base URL is set', () => {
    process.env.S3_ENDPOINT = 'http://minio:9000'
    process.env.S3_BUCKET = 'praetorium'
    process.env.S3_ACCESS_KEY_ID = 'id'
    process.env.S3_SECRET_ACCESS_KEY = 'secret'
    expect(configuredObjectStore()?.publicBaseUrl).toBe(DEFAULT_S3_PUBLIC_BASE_URL)
  })

  it('trims a trailing slash from a configured base URL', () => {
    process.env.S3_ENDPOINT = 'http://minio:9000'
    process.env.S3_BUCKET = 'praetorium'
    process.env.S3_ACCESS_KEY_ID = 'id'
    process.env.S3_SECRET_ACCESS_KEY = 'secret'
    process.env.S3_PUBLIC_BASE_URL = 'http://localhost:9000/praetorium/'
    expect(configuredObjectStore()?.publicBaseUrl).toBe('http://localhost:9000/praetorium')
  })

  it('writes an avatar through the Worker R2 binding without S3 credentials', async () => {
    const head = vi.fn(async () => null)
    const put = vi.fn(async () => ({}))
    const bucket = { head, put } as unknown as R2Bucket
    await withWorkerAppContext(
      async () => {
        const store = configuredObjectStore()
        expect(store?.kind).toBe('r2')
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
})
